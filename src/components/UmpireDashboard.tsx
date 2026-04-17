import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc, updateDoc, where, addDoc } from 'firebase/firestore';
import { Tournament, Match, Player, Umpire } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Input } from './ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from './ui/dialog';
import { 
  Users, 
  Trophy, 
  Calendar, 
  Clock, 
  LayoutDashboard, 
  Play, 
  Power, 
  MapPin, 
  Activity,
  UserCheck,
  ChevronRight,
  Info,
  Plus,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import UmpireScoring from './UmpireScoring';

interface UmpireDashboardProps {
  tournament: Tournament;
  onExit: () => void;
}

export default function UmpireDashboard({ tournament, onExit }: UmpireDashboardProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [umpires, setUmpires] = useState<Umpire[]>([]);
  const [selectedUmpireId, setSelectedUmpireId] = useState<string | null>(localStorage.getItem(`umpireId_${tournament.id}`));
  const [scoringMatchId, setScoringMatchId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('match-queue');
  const [isAddMatchOpen, setIsAddMatchOpen] = useState(false);
  const [isAutoScheduling, setIsAutoScheduling] = useState(false);

  useEffect(() => {
    if (!tournament.id) return;

    const unsubMatches = onSnapshot(collection(db, `tournaments/${tournament.id}/matches`), (snapshot) => {
      setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
    }, err => handleFirestoreError(err, OperationType.GET, `tournaments/${tournament.id}/matches`));

    const unsubPlayers = onSnapshot(collection(db, `tournaments/${tournament.id}/players`), (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    }, err => handleFirestoreError(err, OperationType.GET, `tournaments/${tournament.id}/players`));

    const unsubUmpires = onSnapshot(collection(db, `tournaments/${tournament.id}/umpires`), (snapshot) => {
      setUmpires(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Umpire)));
    }, err => handleFirestoreError(err, OperationType.GET, `tournaments/${tournament.id}/umpires`));

    return () => {
      unsubMatches();
      unsubPlayers();
      unsubUmpires();
    };
  }, [tournament.id]);

  const toggleAvailability = async (umpireId: string, current: boolean) => {
    try {
      await updateDoc(doc(db, `tournaments/${tournament.id}/umpires/${umpireId}`), {
        isAvailable: !current
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `tournaments/${tournament.id}/umpires/${umpireId}`);
    }
  };

  const currentUmpire = umpires.find(u => u.id === selectedUmpireId);

  const addNewMatch = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const p1Id = formData.get('player1Id') as string;
    const p2Id = formData.get('player2Id') as string;
    const court = parseInt(formData.get('courtNumber') as string);
    const category = formData.get('category') as Player['category'];
    const stage = formData.get('stage') as Match['stage'];

    const p1 = players.find(p => p.id === p1Id);
    const p2 = players.find(p => p.id === p2Id);

    if (!p1 || !p2) return;

    try {
      const matchData: Omit<Match, 'id'> = {
        tournamentId: tournament.id!,
        courtNumber: court,
        player1: p1.name || p1.teamName || 'Unknown',
        player2: p2.name || p2.teamName || 'Unknown',
        player1Id: p1Id,
        player2Id: p2Id,
        score1: 0,
        score2: 0,
        status: 'scheduled',
        isDoubles: p1.category !== 'singles',
        server: 'p1',
        sets: [],
        currentSet: 1,
        category: category,
        stage: stage,
        roundName: stage === 'group' ? 'Group Stage' : 'Knockout'
      };

      await addDoc(collection(db, `tournaments/${tournament.id}/matches`), matchData);
      setIsAddMatchOpen(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `tournaments/${tournament.id}/matches`);
    }
  };

  const autoSchedule = async () => {
    setIsAutoScheduling(true);
    try {
      // 1. Find all players not in a pending/ongoing match
      const busyPlayerIds = new Set<string>();
      matches.filter(m => m.status !== 'completed').forEach(m => {
        if (m.player1Id) busyPlayerIds.add(m.player1Id);
        if (m.player2Id) busyPlayerIds.add(m.player2Id);
      });

      const freePlayers = players.filter(p => p.id && !busyPlayerIds.has(p.id));
      
      // 2. Pair them inside categories
      const categories: Player['category'][] = ['singles', 'doubles', 'mixed'];
      let scheduledCount = 0;

      for (const cat of categories) {
        const catPlayers = freePlayers.filter(p => p.category === cat);
        for (let i = 0; i < catPlayers.length - 1; i += 2) {
          const p1 = catPlayers[i];
          const p2 = catPlayers[i+1];

          // 3. Find first available court
          const occupiedCourts = new Set(matches.filter(m => m.status !== 'completed').map(m => m.courtNumber));
          let courtNum = 1;
          while (occupiedCourts.has(courtNum) && courtNum <= tournament.numCourts) {
            courtNum++;
          }
          
          if (courtNum > tournament.numCourts) courtNum = 1; // Overflow to court 1 if all full

          const matchData: Omit<Match, 'id'> = {
            tournamentId: tournament.id!,
            courtNumber: courtNum,
            player1: p1.name || p1.teamName || 'Unknown',
            player2: p2.name || p2.teamName || 'Unknown',
            player1Id: p1.id,
            player2Id: p2.id,
            score1: 0,
            score2: 0,
            status: 'scheduled',
            isDoubles: p1.category !== 'singles',
            server: 'p1',
            sets: [],
            currentSet: 1,
            category: cat,
            stage: 'knockout',
            roundName: 'Auto-Scheduled'
          };

          await addDoc(collection(db, `tournaments/${tournament.id}/matches`), matchData);
          scheduledCount++;
          occupiedCourts.add(courtNum);
        }
      }

      console.log(`Auto-scheduled ${scheduledCount} matches.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `tournaments/${tournament.id}/all_matches`);
    } finally {
      setIsAutoScheduling(false);
    }
  };

  if (scoringMatchId) {
    return (
      <UmpireScoring 
        matchId={scoringMatchId} 
        tournamentId={tournament.id!} 
        onExit={() => setScoringMatchId(null)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Umpire Identity Selection Overlay */}
      <AnimatePresence>
        {!selectedUmpireId && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[60] flex items-center justify-center p-4"
          >
            <Card className="max-w-md w-full border-none shadow-2xl">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl shadow-blue-500/20 rotate-3">
                  <UserCheck className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-2xl font-black">Official Umpire Login</CardTitle>
                <CardDescription>Select your name to access the scoring panel</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-h-[300px] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-200">
                  {umpires.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 italic">No officials registered yet.</div>
                  ) : (
                    umpires.map(u => (
                      <Button 
                        key={u.id}
                        variant="outline"
                        className="w-full h-14 justify-between text-lg font-bold border-2 hover:border-blue-500 hover:bg-blue-50 transition-all rounded-xl"
                        onClick={() => {
                          setSelectedUmpireId(u.id!);
                          localStorage.setItem(`umpireId_${tournament.id}`, u.id!);
                        }}
                      >
                        {u.name}
                        <ChevronRight className="w-5 h-5 text-slate-300" />
                      </Button>
                    ))
                  )}
                </div>
                <Button variant="ghost" className="w-full text-slate-500" onClick={onExit}>
                  Cancel Login
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Dashboard Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-slate-900 p-2 rounded-xl">
              <Activity className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h1 className="font-black text-xl tracking-tight text-slate-900">{tournament.name}</h1>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px] font-bold h-5 border-blue-100 text-blue-600 bg-blue-50">
                  UMPIRE CONSOLE
                </Badge>
                {currentUmpire && (
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Official: {currentUmpire.name}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {currentUmpire && (
              <Button 
                variant={currentUmpire.isAvailable ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-9 font-bold px-4 rounded-lg transition-all",
                  currentUmpire.isAvailable ? "bg-green-600 hover:bg-green-700 shadow-lg shadow-green-500/20" : "text-slate-500"
                )}
                onClick={() => toggleAvailability(currentUmpire.id!, currentUmpire.isAvailable)}
              >
                <Power className="w-3.5 h-3.5 mr-2" />
                {currentUmpire.isAvailable ? 'Available' : 'Unavailable'}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => {
              localStorage.removeItem(`umpireId_${tournament.id}`);
              setSelectedUmpireId(null);
            }} className="text-slate-400 hover:text-slate-600">
              Switch Official
            </Button>
            <Button variant="outline" size="sm" onClick={onExit} className="border-slate-200 text-slate-600 h-9 font-bold">
              Exit Console
            </Button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue="match-queue" className="space-y-8" onValueChange={setActiveTab}>
          <div className="flex items-center justify-between overflow-x-auto pb-2 scrollbar-none">
            <TabsList className="bg-white border border-slate-200 p-1.5 rounded-2xl h-auto shrink-0 shadow-sm">
              <TabsTrigger value="match-queue" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Clock className="w-4 h-4 mr-2" /> Match Queue
              </TabsTrigger>
              <TabsTrigger value="players" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Users className="w-4 h-4 mr-2" /> Participants
              </TabsTrigger>
              <TabsTrigger value="format" className="rounded-xl px-6 py-2.5 font-bold data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Info className="w-4 h-4 mr-2" /> Tournament Info
              </TabsTrigger>
            </TabsList>

            <div className="hidden lg:flex items-center gap-6 pr-4">
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Active Courts</p>
                <p className="text-xl font-black text-slate-900">{tournament.numCourts}</p>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total Matches</p>
                <p className="text-xl font-black text-slate-900">{matches.length}</p>
              </div>
            </div>
          </div>

          <TabsContent value="match-queue" className="mt-0 focus-visible:ring-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Ongoing Matches */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-600" />
                    Recommended Matches
                  </h2>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="bg-blue-50 text-blue-600 border-blue-100 hover:bg-blue-100"
                      onClick={autoSchedule}
                      disabled={isAutoScheduling}
                    >
                      {isAutoScheduling ? (
                        <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin mr-2" />
                      ) : (
                        <Sparkles className="w-4 h-4 mr-2" />
                      )}
                      Auto-Schedule
                    </Button>

                    <Dialog open={isAddMatchOpen} onOpenChange={setIsAddMatchOpen}>
                      <DialogTrigger render={<Button size="sm" className="bg-slate-900 hover:bg-slate-800">
                        <Plus className="w-4 h-4 mr-2" /> New Match
                      </Button>} />
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Create New Match</DialogTitle>
                          <DialogDescription>Manually pair players for a quick match</DialogDescription>
                        </DialogHeader>
                        <form onSubmit={addNewMatch} className="space-y-4 pt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase text-slate-400">Category</label>
                              <select name="category" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white" required>
                                <option value="singles">Singles</option>
                                <option value="doubles">Doubles</option>
                                <option value="mixed">Mixed</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase text-slate-400">Stage</label>
                              <select name="stage" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white" required>
                                <option value="group">Group Stage</option>
                                <option value="knockout">Knockout Stage</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-slate-400">Court</label>
                            <Input name="courtNumber" type="number" min="1" max={tournament.numCourts} defaultValue="1" required className="h-10 rounded-xl" />
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase text-slate-400">Player 1 / Team 1</label>
                              <select name="player1Id" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white" required>
                                <option value="">Select Player...</option>
                                {players.map(p => (
                                  <option key={p.id} value={p.id}>{p.name || p.teamName} ({p.category})</option>
                                ))}
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-xs font-black uppercase text-slate-400">Player 2 / Team 2</label>
                              <select name="player2Id" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm bg-white" required>
                                <option value="">Select Player...</option>
                                {players.map(p => (
                                  <option key={p.id} value={p.id}>{p.name || p.teamName} ({p.category})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <Button type="submit" className="w-full bg-blue-600 h-11 font-black shadow-lg shadow-blue-500/20">
                            Create Match
                          </Button>
                        </form>
                      </DialogContent>
                    </Dialog>

                    <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-100 h-9 px-3">
                      {matches.filter(m => m.status !== 'completed').length} Pending
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {matches.filter(m => m.status !== 'completed').map(match => (
                    <Card key={match.id} className={cn(
                      "group border-2 transition-all hover:shadow-xl hover:-translate-y-1 overflow-hidden h-fit",
                      match.status === 'ongoing' ? "border-blue-500 bg-blue-50/30" : "border-slate-100 hover:border-blue-200"
                    )}>
                      <div className="p-5 space-y-4">
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-blue-600 bg-blue-100/50 w-fit px-2 py-0.5 rounded-full uppercase tracking-widest">
                              Court {match.courtNumber || 'TBD'}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                              {match.stage === 'group' ? match.groupName : match.roundName} • {match.isDoubles ? 'Doubles' : 'Singles'}
                            </span>
                          </div>
                          {match.status === 'ongoing' && (
                            <Badge className="bg-blue-600 animate-pulse">LIVE SCORING</Badge>
                          )}
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-black text-slate-900 truncate">{match.player1}</p>
                                <Badge variant="outline" className="text-[8px] h-4 px-1 leading-none uppercase text-slate-400 border-slate-200 font-bold">
                                  {match.category || 'Singles'}
                                </Badge>
                              </div>
                              {match.isDoubles && <p className="text-[10px] text-slate-400 italic">and partner</p>}
                            </div>
                            <div className="px-3 py-1 bg-white rounded-lg border border-slate-100 text-[10px] font-black group-hover:bg-blue-600 group-hover:text-white transition-colors">VS</div>
                            <div className="flex-1 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Badge variant="outline" className="text-[8px] h-4 px-1 leading-none uppercase text-slate-400 border-slate-200 font-bold">
                                  {match.category || 'Singles'}
                                </Badge>
                                <p className="text-sm font-black text-slate-900 truncate">{match.player2}</p>
                              </div>
                              {match.isDoubles && <p className="text-[10px] text-slate-400 italic">and partner</p>}
                            </div>
                          </div>
                        </div>

                        <Button 
                          className={cn(
                            "w-full h-12 font-black shadow-lg transition-all",
                            match.status === 'ongoing' ? "bg-blue-600 hover:bg-blue-700" : "bg-slate-900 hover:bg-slate-800"
                          )}
                          onClick={() => setScoringMatchId(match.id!)}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          {match.status === 'ongoing' ? 'Resume Scoring' : 'Start Match'}
                        </Button>
                      </div>
                    </Card>
                  ))}
                  {matches.filter(m => m.status !== 'completed').length === 0 && (
                    <div className="col-span-full py-20 text-center space-y-4 bg-white rounded-3xl border-2 border-dashed border-slate-200">
                      <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-300">
                        <Calendar className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-black text-slate-900">All matched completed!</p>
                        <p className="text-sm text-slate-400">Waiting for next round scheduling...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Sidebar: Availability & Resources */}
              <div className="space-y-8">
                <Card className="border-none shadow-sm bg-slate-900 text-white overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-10">
                    <UserCheck className="w-20 h-20" />
                  </div>
                  <CardHeader>
                    <CardTitle className="text-lg">My Status</CardTitle>
                    <CardDescription className="text-slate-400">Manage your officiating availability</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {currentUmpire ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
                          <div className="flex items-center gap-3">
                            <div className={cn("w-3 h-3 rounded-full animate-pulse", currentUmpire.isAvailable ? "bg-green-500" : "bg-red-500")} />
                            <span className="font-bold text-sm tracking-wide">{currentUmpire.isAvailable ? 'Ready to Official' : 'On Leave'}</span>
                          </div>
                          <Button 
                            variant="primary" 
                            size="sm" 
                            className="bg-white text-slate-900 hover:bg-slate-100 font-black h-8 px-4"
                            onClick={() => toggleAvailability(currentUmpire.id!, currentUmpire.isAvailable)}
                          >
                            Toggle
                          </Button>
                        </div>
                        <p className="text-[10px] text-slate-400 leading-relaxed italic">
                          Marking yourself as "Available" allows the system to automatically assign you to new matches.
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-white/60 italic">Official profile not linked.</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-none shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-500">Tournament Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Venue</span>
                      <span className="font-bold text-slate-900">{tournament.venue}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Date</span>
                      <span className="font-bold text-slate-900">{tournament.date}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">Courts</span>
                      <div className="flex gap-1">
                        {Array.from({ length: tournament.numCourts }).map((_, i) => (
                          <Badge key={i} variant="outline" className="text-[9px] w-6 h-6 flex items-center justify-center p-0 rounded-md">
                            {i + 1}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="players" className="mt-0">
            <Card className="border-none shadow-sm h-full">
              <CardHeader className="flex flex-row items-center justify-between bg-white border-b border-slate-100 rounded-t-3xl">
                <div>
                  <CardTitle>Registered Participants</CardTitle>
                  <CardDescription>Official roster for scoring reference</CardDescription>
                </div>
                <Badge className="bg-slate-900">{players.length} Total</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                  {['singles', 'doubles', 'mixed'].map(cat => (
                    <div key={cat} className="space-y-4">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        {cat}
                      </h3>
                      <div className="space-y-2">
                        {players.filter(p => p.category === cat).map(p => (
                          <div key={p.id} className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl hover:shadow-md transition-all group">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                                <Users className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-black text-slate-900 text-sm">{p.name || p.teamName}</p>
                                {p.isTeam && p.members && <p className="text-[10px] text-slate-400">{p.members.join(' & ')}</p>}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-black text-blue-600 uppercase tracking-tighter">
                                {p.stats?.wins || 0}W - {p.stats?.losses || 0}L
                              </p>
                            </div>
                          </div>
                        ))}
                        {players.filter(p => p.category === cat).length === 0 && (
                          <p className="text-xs text-slate-400 italic py-2 px-1">No entries in this category.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="format" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <div className="h-1.5 bg-blue-600" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-blue-600" />
                    Format Configuration
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                   <div className="divide-y divide-slate-100">
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">Point System</span>
                        <Badge variant="secondary" className="bg-slate-100">BWF Standard (21x3)</Badge>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">Court Mapping</span>
                        <div className="flex gap-2">
                          {Object.entries(tournament.courtNames || {}).map(([num, name]) => (
                            <Badge key={num} variant="outline" className="text-[10px]">{name}</Badge>
                          ))}
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-500">Access PINs</span>
                        <div className="flex gap-2">
                          <code className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">U:${tournament.umpirePin}</code>
                          <code className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">A:${tournament.audiencePin}</code>
                        </div>
                      </div>
                   </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-sm bg-white overflow-hidden">
                 <div className="h-1.5 bg-slate-900" />
                 <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-slate-900" />
                    Venue Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-50 rounded-2xl p-6 text-center space-y-2 border border-slate-100">
                    <h3 className="text-2xl font-black text-slate-900">{tournament.venue}</h3>
                    <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                      <Calendar className="w-4 h-4" /> {tournament.date}
                    </p>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-100 flex gap-3">
                    <Info className="w-5 h-5 text-yellow-600 shrink-0" />
                    <p className="text-xs text-yellow-700 leading-relaxed">
                      <strong>Umpire Note:</strong> Please ensure you are at your assigned court at least 5 minutes before the match start time. Toggle your availability if you need to take a break.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer Branding */}
      <footer className="max-w-7xl mx-auto px-4 py-12 text-center">
        <div className="flex items-center justify-center gap-2 opacity-30 grayscale hover:grayscale-0 transition-all cursor-default scale-90">
          <Trophy className="w-5 h-5 text-slate-900" />
          <span className="font-black text-xl tracking-tighter text-slate-900">SmashTrack</span>
        </div>
      </footer >
    </div>
  );
}
