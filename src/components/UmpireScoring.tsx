import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, onSnapshot, runTransaction } from 'firebase/firestore';
import { Match } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { ArrowLeft, RotateCcw, ChevronRight, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from './ui/dialog';

interface UmpireScoringProps {
  matchId: string;
  tournamentId: string;
  onExit: () => void;
}

export default function UmpireScoring({ matchId, tournamentId, onExit }: UmpireScoringProps) {
  const [match, setMatch] = useState<Match | null>(null);
  const [undoStack, setUndoStack] = useState<Partial<Match>[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSideSwitch, setShowSideSwitch] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, `tournaments/${tournamentId}/matches/${matchId}`), (snapshot) => {
      if (snapshot.exists()) {
        setMatch({ id: snapshot.id, ...snapshot.data() } as Match);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `tournaments/${tournamentId}/matches/${matchId}`);
    });
    return () => unsubscribe();
  }, [matchId, tournamentId]);

  const updateScore = async (player: 1 | 2, amount: number) => {
    if (!match) return;
    
    // Save state for undo
    setUndoStack(prev => [...prev, { 
      score1: match.score1, 
      score2: match.score2, 
      server: match.server, 
      sets: [...match.sets],
      currentSet: match.currentSet
    }]);

    const matchRef = doc(db, `tournaments/${tournamentId}/matches/${matchId}`);
    let newScore1 = player === 1 ? match.score1 + amount : match.score1;
    let newScore2 = player === 2 ? match.score2 + amount : match.score2;

    // Basic Badminton Logic: Server changes on point win
    let newServer = match.server;
    if (player === 1) newServer = 'p1';
    if (player === 2) newServer = 'p2';

    // Check for set win (21 points, or 2 point lead after 20, max 30)
    const isSetOver = (s1: number, s2: number) => {
      if (s1 >= 21 && s1 - s2 >= 2) return true;
      if (s2 >= 21 && s2 - s1 >= 2) return true;
      if (s1 === 30 || s2 === 30) return true;
      return false;
    };

    if (isSetOver(newScore1, newScore2)) {
      const newSets = [...match.sets, { s1: newScore1, s2: newScore2 }];
      const isMatchOver = newSets.length >= 2 && (
        (newSets.filter(s => s.s1 > s.s2).length >= 2) || 
        (newSets.filter(s => s.s2 > s.s1).length >= 2)
      );

      await updateDoc(matchRef, {
        score1: 0,
        score2: 0,
        sets: newSets,
        currentSet: match.currentSet + 1,
        status: isMatchOver ? 'completed' : 'ongoing'
      });
      
      if (isMatchOver) {
        setShowEndConfirm(true);
      }
      return;
    }

    // Check for 3rd set mid-point side switch logic
    if (match.currentSet === 3 && (newScore1 === 11 || newScore2 === 11) && amount > 0) {
      // Small check to ensure we only show the dialog once when the score hits 11
      const isExactly11 = (newScore1 === 11 && match.score1 < 11) || (newScore2 === 11 && match.score2 < 11);
      if (isExactly11) {
        setShowSideSwitch(true);
      }
    }

    await updateDoc(matchRef, {
      score1: Math.max(0, newScore1),
      score2: Math.max(0, newScore2),
      server: newServer,
      status: 'ongoing'
    });
  };

  const manualScoreUpdate = async (player: 1 | 2, value: string) => {
    if (!match) return;
    const score = parseInt(value) || 0;
    
    setUndoStack(prev => [...prev, { 
      score1: match.score1, 
      score2: match.score2, 
      server: match.server, 
      sets: [...match.sets],
      currentSet: match.currentSet
    }]);

    const matchRef = doc(db, `tournaments/${tournamentId}/matches/${matchId}`);
    await updateDoc(matchRef, {
      [player === 1 ? 'score1' : 'score2']: Math.max(0, score)
    });
  };

  const nextSetManually = async () => {
    if (!match) return;
    
    setUndoStack(prev => [...prev, { 
      score1: match.score1, 
      score2: match.score2, 
      server: match.server, 
      sets: [...match.sets],
      currentSet: match.currentSet
    }]);

    const matchRef = doc(db, `tournaments/${tournamentId}/matches/${matchId}`);
    const newSets = [...match.sets, { s1: match.score1, s2: match.score2 }];
    
    await updateDoc(matchRef, {
      score1: 0,
      score2: 0,
      sets: newSets,
      currentSet: match.currentSet + 1
    });
  };

  const undo = async () => {
    if (undoStack.length === 0) return;
    const lastState = undoStack[undoStack.length - 1];
    const matchRef = doc(db, `tournaments/${tournamentId}/matches/${matchId}`);
    await updateDoc(matchRef, lastState);
    setUndoStack(prev => prev.slice(0, -1));
  };

  const endMatch = async () => {
    if (!match) return;
    
    try {
      await runTransaction(db, async (transaction) => {
        const matchRef = doc(db, `tournaments/${tournamentId}/matches/${matchId}`);
        const matchDoc = await transaction.get(matchRef);
        
        if (!matchDoc.exists()) throw new Error("Match does not exist");
        const matchData = matchDoc.data() as Match;

        if (matchData.status === 'completed') return; // Already processed

        // 1. Update match status
        transaction.update(matchRef, { status: 'completed' });

        // 2. Determine winner and loser based on sets
        const p1Wins = matchData.sets.filter(s => s.s1 > s.s2).length;
        const p2Wins = matchData.sets.filter(s => s.s1 < s.s2).length;
        
        const winnerId = p1Wins > p2Wins ? matchData.player1Id : matchData.player2Id;
        const loserId = p1Wins > p2Wins ? matchData.player2Id : matchData.player1Id;

        // 3. Update Winner Stats if ID exists
        if (winnerId) {
          const winnerRef = doc(db, `tournaments/${tournamentId}/players/${winnerId}`);
          const winnerDoc = await transaction.get(winnerRef);
          if (winnerDoc.exists()) {
            const currentStats = winnerDoc.data().stats || { matchesPlayed: 0, wins: 0, losses: 0, totalPoints: 0 };
            transaction.update(winnerRef, {
              stats: {
                ...currentStats,
                matchesPlayed: currentStats.matchesPlayed + 1,
                wins: currentStats.wins + 1
              }
            });
          }
        }

        // 4. Update Loser Stats if ID exists
        if (loserId) {
          const loserRef = doc(db, `tournaments/${tournamentId}/players/${loserId}`);
          const loserDoc = await transaction.get(loserRef);
          if (loserDoc.exists()) {
            const currentStats = loserDoc.data().stats || { matchesPlayed: 0, wins: 0, losses: 0, totalPoints: 0 };
            transaction.update(loserRef, {
              stats: {
                ...currentStats,
                matchesPlayed: currentStats.matchesPlayed + 1,
                losses: currentStats.losses + 1
              }
            });
          }
        }
      });
      onExit();
    } catch (error) {
      console.error("Error finalizing match stats:", error);
      handleFirestoreError(error, OperationType.WRITE, `tournaments/${tournamentId}/matches/${matchId}`);
    }
  };

  if (!match) return <div className="p-8 text-center">Loading match...</div>;

  return (
    <div className="fixed inset-0 bg-slate-950 text-white z-[100] flex flex-col overflow-hidden select-none">
      {/* Top Bar */}
      <div className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onExit} className="text-white/60 hover:text-white">
            <ArrowLeft className="w-4 h-4 mr-2" /> Exit
          </Button>
          <div className="h-4 w-px bg-white/10" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-white/80">Court {match.courtNumber} • {match.isDoubles ? 'Doubles' : 'Singles'}</span>
            {(match.stage || match.roundName) && (
              <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">
                {match.stage === 'group' ? match.groupName : match.roundName}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" onClick={undo} disabled={undoStack.length === 0} className="bg-transparent border-white/20 text-white hover:bg-white/10">
            <RotateCcw className="w-4 h-4 mr-2" /> Undo
          </Button>
          <Badge className="bg-green-500 animate-pulse">LIVE</Badge>
        </div>
      </div>

      {/* Main Scoring Area - Optimized for Landscape */}
      <div className="flex-1 flex">
        {/* Player 1 Side */}
        <div 
          className={cn(
            "flex-1 flex flex-col items-center justify-center relative cursor-pointer transition-all active:scale-95",
            match.server === 'p1' ? "bg-blue-600/20" : "bg-transparent"
          )}
          onClick={() => updateScore(1, 1)}
        >
          {/* Status Overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {match.score1 >= 20 && match.score2 >= 20 && match.score1 === match.score2 && (
              <div className="bg-yellow-400 text-slate-900 px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4 shadow-xl z-20">Deuce</div>
            )}
            {match.score1 >= 20 && (match.score1 > match.score2) && (match.score1 - match.score2 === 1) && (
              <div className="bg-red-500 text-white px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4 shadow-xl z-20 animate-pulse">
                {match.currentSet === 3 || (match.currentSet === 2 && match.sets[0]?.s1 > match.sets[0]?.s2) ? 'Match Point' : 'Set Point'}
              </div>
            )}
          </div>
          
          {match.server === 'p1' && (
            <motion.div layoutId="server" className="absolute top-8 bg-yellow-400 text-slate-900 px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase shadow-lg">
              Serving
            </motion.div>
          )}
          <div className="text-center space-y-4">
            <h3 className={cn(
              "text-2xl font-bold uppercase tracking-widest transition-opacity",
              match.server === 'p1' ? "opacity-100 text-blue-400" : "opacity-60"
            )}>
              {match.player1}
              {match.server === 'p1' && <span className="ml-2 text-yellow-400">●</span>}
            </h3>
            <div className="flex flex-col items-center gap-4">
              <div className="text-[15vw] font-black leading-none tabular-nums drop-shadow-2xl">{match.score1}</div>
              <div onClick={(e) => e.stopPropagation()}>
                <Input 
                  type="number" 
                  className="w-20 h-10 bg-white/5 border-white/10 text-center text-xl font-bold"
                  value={match.score1}
                  onChange={(e) => manualScoreUpdate(1, e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="absolute bottom-8 text-white/20 text-xs uppercase tracking-[0.3em]">Tap to add point</div>
        </div>

        {/* Divider */}
        <div className="w-px bg-white/10 flex flex-col items-center justify-center gap-4 py-8">
          <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white/40">VS</div>
        </div>

        {/* Player 2 Side */}
        <div 
          className={cn(
            "flex-1 flex flex-col items-center justify-center relative cursor-pointer transition-all active:scale-95",
            match.server === 'p2' ? "bg-red-600/20" : "bg-transparent"
          )}
          onClick={() => updateScore(2, 1)}
        >
          {/* Status Overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {match.score1 >= 20 && match.score2 >= 20 && match.score1 === match.score2 && (
              <div className="bg-yellow-400 text-slate-900 px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4 shadow-xl z-20">Deuce</div>
            )}
            {match.score2 >= 20 && (match.score2 > match.score1) && (match.score2 - match.score1 === 1) && (
              <div className="bg-red-500 text-white px-4 py-1 rounded-full text-[10px] font-black tracking-widest uppercase mb-4 shadow-xl z-20 animate-pulse">
                {match.currentSet === 3 || (match.currentSet === 2 && match.sets[0]?.s2 > match.sets[0]?.s1) ? 'Match Point' : 'Set Point'}
              </div>
            )}
          </div>

          {match.server === 'p2' && (
            <motion.div layoutId="server" className="absolute top-8 bg-yellow-400 text-slate-900 px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase shadow-lg">
              Serving
            </motion.div>
          )}
          <div className="text-center space-y-4">
            <h3 className={cn(
              "text-2xl font-bold uppercase tracking-widest transition-opacity",
              match.server === 'p2' ? "opacity-100 text-red-400" : "opacity-60"
            )}>
              {match.player2}
              {match.server === 'p2' && <span className="ml-2 text-yellow-400">●</span>}
            </h3>
            <div className="flex flex-col items-center gap-4">
              <div className="text-[15vw] font-black leading-none tabular-nums drop-shadow-2xl">{match.score2}</div>
              <div onClick={(e) => e.stopPropagation()}>
                <Input 
                  type="number" 
                  className="w-20 h-10 bg-white/5 border-white/10 text-center text-xl font-bold"
                  value={match.score2}
                  onChange={(e) => manualScoreUpdate(2, e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="absolute bottom-8 text-white/20 text-xs uppercase tracking-[0.3em]">Tap to add point</div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="h-24 border-t border-white/10 bg-slate-900/80 flex items-center justify-around px-4">
        <div className="flex flex-col gap-2">
          <Button variant="ghost" className="flex-col h-auto py-2 gap-1 text-white/60" onClick={() => updateScore(1, -1)}>
            <span className="text-xs font-bold">-1 P1</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-[10px] text-white/40" onClick={() => {
            const matchRef = doc(db, `tournaments/${tournamentId}/matches/${matchId}`);
            updateDoc(matchRef, { server: 'p1' });
          }}>Set Server P1</Button>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex gap-4">
            {match.sets.map((set, idx) => (
              <div key={idx} className="text-center bg-white/5 px-3 py-1 rounded-lg border border-white/5">
                <p className="text-[10px] text-white/40 uppercase font-bold mb-0.5">Set {idx + 1}</p>
                <p className="font-mono text-base font-bold">{set.s1}-{set.s2}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Button 
              className="bg-white text-slate-950 hover:bg-slate-200 font-bold px-8 h-12" 
              onClick={() => setShowEndConfirm(true)}
            >
              End Match
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 text-[10px] border-white/10 bg-transparent text-white/60 hover:bg-white/5"
              onClick={nextSetManually}
            >
              <ChevronRight className="w-3 h-3 mr-1" /> Next Set Manually
            </Button>
          </div>

          <div className="text-center bg-blue-600/20 px-4 py-2 rounded-xl border border-blue-500/30">
            <p className="text-[10px] text-blue-400 uppercase font-bold mb-0.5">Current</p>
            <p className="font-mono text-xl font-black">Set {match.currentSet}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="ghost" className="flex-col h-auto py-2 gap-1 text-white/60" onClick={() => updateScore(2, -1)}>
            <span className="text-xs font-bold">-1 P2</span>
          </Button>
          <Button variant="ghost" size="sm" className="text-[10px] text-white/40" onClick={() => {
            const matchRef = doc(db, `tournaments/${tournamentId}/matches/${matchId}`);
            updateDoc(matchRef, { server: 'p2' });
          }}>Set Server P2</Button>
        </div>
      </div>

      <Dialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-2xl">
              <CheckCircle2 className="w-6 h-6 text-green-500" />
              Match Completed?
            </DialogTitle>
            <DialogDescription className="text-white/60 text-lg pt-2">
              <div className="mb-4">
                <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">{match.stage === 'group' ? match.groupName : match.roundName}</span>
                <div className="text-white">Final Score: <span className="font-bold">{match.score1} - {match.score2}</span> (Set {match.currentSet})</div>
              </div>
              Are you sure you want to end this match and return to the dashboard?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-3 sm:justify-center pt-6">
            <Button 
              variant="outline" 
              onClick={() => setShowEndConfirm(false)}
              className="bg-transparent border-white/20 text-white hover:bg-white/10 h-12 px-8"
            >
              Continue Scoring
            </Button>
            <Button 
              onClick={endMatch}
              className="bg-green-600 hover:bg-green-700 text-white font-bold h-12 px-8"
            >
              Confirm & Exit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Side Switch Dialog (Deciding Set) */}
      <Dialog open={showSideSwitch} onOpenChange={setShowSideSwitch}>
        <DialogContent className="bg-blue-900 border-white/20 text-white">
          <DialogHeader className="items-center text-center">
            <RotateCcw className="w-12 h-12 text-yellow-400 mb-2 animate-spin-slow" />
            <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">
              Switch Sides!
            </DialogTitle>
            <DialogDescription className="text-blue-100/80">
              It's 11 points in the deciding set. Players must now switch sides of the court.
            </DialogDescription>
          </DialogHeader>
          <Button onClick={() => setShowSideSwitch(false)} className="w-full bg-white text-blue-950 font-black hover:bg-blue-50 mt-4">
            CONFIRMED
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
