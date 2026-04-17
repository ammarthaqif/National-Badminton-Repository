import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, doc } from 'firebase/firestore';
import { Tournament, Match, Player } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Trophy, 
  MapPin, 
  Calendar, 
  Clock, 
  Users, 
  Activity, 
  CheckCircle2, 
  ChevronRight,
  TrendingUp,
  BarChart3,
  Info,
  ArrowLeft,
  Play
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';

interface AudienceViewProps {
  tournamentId: string;
  onSelectMatch?: (matchId: string) => void; 
  onExit?: () => void;
  onBack?: () => void;
}

export default function AudienceView({ tournamentId, onSelectMatch, onExit, onBack }: AudienceViewProps) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [activeTab, setActiveTab] = useState('live');

  useEffect(() => {
    const unsubTournament = onSnapshot(doc(db, `tournaments/${tournamentId}`), (snapshot) => {
      if (snapshot.exists()) {
        setTournament({ id: snapshot.id, ...snapshot.data() } as Tournament);
      }
    }, err => handleFirestoreError(err, OperationType.GET, `tournaments/${tournamentId}`));

    const unsubMatches = onSnapshot(collection(db, `tournaments/${tournamentId}/matches`), (snapshot) => {
      setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
    }, err => handleFirestoreError(err, OperationType.GET, `tournaments/${tournamentId}/matches`));

    const unsubPlayers = onSnapshot(collection(db, `tournaments/${tournamentId}/players`), (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    }, err => handleFirestoreError(err, OperationType.GET, `tournaments/${tournamentId}/players`));

    return () => {
      unsubTournament();
      unsubMatches();
      unsubPlayers();
    };
  }, [tournamentId]);

  if (!tournament) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="font-bold text-slate-400 uppercase tracking-widest text-xs">Loading Tournament...</p>
      </div>
    </div>
  );

  const liveMatches = matches.filter(m => m.status === 'ongoing');
  const scheduledMatches = matches.filter(m => m.status === 'scheduled');
  const completedMatches = matches.filter(m => m.status === 'completed');

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      {/* Immersive Header */}
      <div className="bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-blue-600/10 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute inset-0 bg-blue-900/10 blur-3xl rounded-full translate-x-1/2 translate-y-1/2" />
        
        <div className="max-w-7xl mx-auto px-6 py-12 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start text-center md:text-left gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2.5 rounded-2xl rotate-3 shadow-xl shadow-blue-500/20">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <span className="font-black text-3xl tracking-tighter uppercase italic text-gold">National Badminton Registry</span>
            </div>
            <div className="space-y-2">
              {(onBack || onExit) && (
                <Button variant="ghost" size="sm" onClick={onBack || onExit} className="text-white/40 hover:text-white -ml-2 mb-2 font-bold uppercase tracking-widest text-[10px]">
                  <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Return Home
                </Button>
              )}
              <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-none text-white">{tournament.name}</h1>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 pt-2">
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 text-xs font-bold text-blue-300">
                  <MapPin className="w-3.5 h-3.5" /> {tournament.venue}
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 text-xs font-bold text-blue-300">
                  <Calendar className="w-3.5 h-3.5" /> {tournament.date}
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-full border border-white/10 text-xs font-bold text-blue-300">
                  <Activity className="w-3.5 h-3.5" /> {tournament.numCourts} Courts
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-4 bg-white/5 p-6 rounded-3xl border border-white/10 backdrop-blur-md">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">Audience Pulse</p>
            <div className="flex gap-8">
              <div className="text-center">
                <p className="text-3xl font-black">{liveMatches.length}</p>
                <p className="text-[10px] uppercase font-bold text-white/40">Live</p>
              </div>
              <div className="w-px h-10 bg-white/10" />
              <div className="text-center">
                <p className="text-3xl font-black">{players.length}</p>
                <p className="text-[10px] uppercase font-bold text-white/40">Players</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 -mt-8 relative z-20">
        <Tabs defaultValue="live" className="space-y-8" onValueChange={setActiveTab}>
          <div className="flex items-center justify-center">
            <TabsList className="bg-white/80 backdrop-blur-md border border-slate-200 p-1.5 rounded-3xl h-auto shadow-xl">
              <TabsTrigger value="live" className="rounded-2xl px-6 py-3 font-black text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Activity className="w-4 h-4 mr-2" /> LIVE SCORES
              </TabsTrigger>
              <TabsTrigger value="schedule" className="rounded-2xl px-6 py-3 font-black text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Clock className="w-4 h-4 mr-2" /> SCHEDULE
              </TabsTrigger>
              <TabsTrigger value="participants" className="rounded-2xl px-6 py-3 font-black text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <Users className="w-4 h-4 mr-2" /> PARTICIPANTS
              </TabsTrigger>
              <TabsTrigger value="results" className="rounded-2xl px-6 py-3 font-black text-sm data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                <TrendingUp className="w-4 h-4 mr-2" /> RESULTS
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Live Section */}
          <TabsContent value="live" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {liveMatches.map(match => (
                <Card key={match.id} className="border-none shadow-xl shadow-blue-900/5 bg-white overflow-hidden group hover:-translate-y-1 transition-all duration-300">
                  <div className="bg-blue-600 px-4 py-2 flex justify-between items-center">
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">
                       {tournament.courtNames?.[match.courtNumber] || `Court ${match.courtNumber}`}
                    </span>
                    <Badge className="bg-white text-blue-600 animate-pulse font-black text-[10px]">LIVE</Badge>
                  </div>
                  <CardContent className="p-6">
                    <div className="flex flex-col gap-6">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-xl font-black text-slate-900 leading-tight truncate">{match.player1}</p>
                          {match.server === 'p1' && <Badge variant="secondary" className="bg-blue-50 text-blue-600 text-[9px] font-bold">SERVING</Badge>}
                        </div>
                        <AnimatePresence mode="wait">
                          <motion.div 
                            key={match.score1}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className={cn(
                              "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black transition-colors shrink-0",
                              match.score1 > match.score2 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"
                            )}>
                            {match.score1}
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="h-px bg-slate-100 flex-1" />
                        <span className="text-[10px] font-black text-slate-300 uppercase italic">VS</span>
                        <div className="h-px bg-slate-100 flex-1" />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <p className="text-xl font-black text-slate-900 leading-tight truncate">{match.player2}</p>
                          {match.server === 'p2' && <Badge variant="secondary" className="bg-blue-50 text-blue-600 text-[9px] font-bold">SERVING</Badge>}
                        </div>
                        <AnimatePresence mode="wait">
                          <motion.div 
                            key={match.score2}
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: -20, opacity: 0 }}
                            className={cn(
                              "w-16 h-16 rounded-2xl flex items-center justify-center text-3xl font-black transition-colors shrink-0",
                              match.score2 > match.score1 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-900"
                            )}>
                            {match.score2}
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      <div className="pt-4 border-t border-slate-100 space-y-4">
                         <div className="flex items-center gap-2 mb-1">
                            <div className="h-1 w-4 bg-blue-600 rounded-full" />
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Match Details</span>
                         </div>
                         
                         <div className="flex items-center justify-between">
                            <div className="flex gap-2">
                               {match.sets?.map((s, i) => (
                                  <div key={i} className="flex flex-col items-center">
                                    <span className="text-[8px] font-bold text-slate-400 uppercase">Set {i+1}</span>
                                    <Badge variant="outline" className="text-[10px] font-mono border-slate-200 bg-slate-50 px-2 py-0.5">{s.s1}-{s.s2}</Badge>
                                  </div>
                               ))}
                               {!match.sets?.length && <span className="text-[10px] font-medium text-slate-400 italic">No sets completed</span>}
                            </div>
                            <div className="text-right">
                               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Status</p>
                               <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-none font-black text-[9px] py-0 px-2">Set {match.currentSet}</Badge>
                            </div>
                         </div>

                         <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-2">
                               <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-slate-200">
                                  <Users className="w-4 h-4 text-slate-400" />
                                </div>
                                <div>
                                   <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Umpire</p>
                                   <p className="text-xs font-bold text-slate-700">{match.umpireName || 'To Be Assigned'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                               <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Format</p>
                               <p className="text-xs font-bold text-slate-700">{match.category || (match.isDoubles ? 'Doubles' : 'Singles')}</p>
                            </div>
                         </div>
                      </div>

                      {onSelectMatch && (
                        <Button className="w-full bg-slate-900 hover:bg-slate-800" onClick={() => onSelectMatch(match.id!)}>
                          <Play className="w-4 h-4 mr-2" /> Open Scoring
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {liveMatches.length === 0 && (
                <div className="col-span-full py-32 text-center bg-white rounded-3xl border-2 border-dashed border-slate-200">
                  <div className="w-20 h-20 bg-slate-50 flex items-center justify-center rounded-3xl mx-auto mb-4 text-slate-300">
                    <Activity className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">No matches currently live</h3>
                  <p className="text-slate-400 px-8 max-w-sm mx-auto">Check the schedule for upcoming games or the results tab for completed sessions.</p>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Schedule Section */}
          <TabsContent value="schedule" className="mt-0">
             <Card className="border-none shadow-xl shadow-slate-900/5 bg-white rounded-3xl">
                <CardHeader>
                  <CardTitle>Upcoming Matches</CardTitle>
                  <CardDescription>Follow the court assignments and expected times</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="divide-y divide-slate-50">
                    {scheduledMatches.map((m) => (
                      <div key={m.id} className="py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 group hover:bg-blue-50/30 px-4 rounded-2xl transition-all">
                        <div className="flex items-center gap-6">
                           <div className="w-16 h-16 bg-slate-50 rounded-2xl flex flex-col items-center justify-center border border-slate-200 shadow-sm group-hover:bg-white transition-colors">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Court</span>
                              <span className="text-2xl font-black text-slate-900">{m.courtNumber || '?' }</span>
                           </div>
                           <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-xl font-black text-slate-900">{m.player1} <span className="text-slate-300 mx-2 text-sm font-black italic">VS</span> {m.player2}</p>
                              </div>
                              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                {m.stage === 'group' ? m.groupName : m.roundName} • {m.category || (m.isDoubles ? 'Doubles' : 'Singles')}
                              </p>
                           </div>
                        </div>
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                           {onSelectMatch && (
                             <Button variant="outline" size="sm" className="flex-1 sm:flex-none border-blue-200 text-blue-600 hover:bg-blue-50" onClick={() => onSelectMatch(m.id!)}>
                               Start Scoring
                             </Button>
                           )}
                           <Badge variant="outline" className="border-slate-200 text-slate-400 font-black h-8 px-4">SCHEDULED</Badge>
                        </div>
                      </div>
                    ))}
                    {scheduledMatches.length === 0 && (
                       <p className="text-center py-12 text-slate-400 italic font-medium">No matches currently scheduled.</p>
                    )}
                  </div>
                </CardContent>
             </Card>
          </TabsContent>

          {/* Participants Section */}
          <TabsContent value="participants" className="mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 space-y-6">
                  <div className="flex items-center justify-between">
                     <h2 className="text-2xl font-black text-slate-900">Player Roster</h2>
                     <div className="flex gap-2">
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-none">{players.length} Total</Badge>
                     </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                     {players.map(p => {
                       const winRate = (p.stats?.matchesPlayed || 0) > 0 ? Math.round(((p.stats?.wins || 0) / (p.stats?.matchesPlayed || 0)) * 100) : 0;
                       
                       return (
                        <Card key={p.id} className="border-none shadow-sm hover:shadow-md transition-all overflow-hidden bg-white">
                          <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                                <Users className="w-6 h-6" />
                              </div>
                              <div>
                                <p className="font-black text-slate-900 leading-tight">{p.name || p.teamName}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{p.category}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-black text-blue-600">{winRate}%</p>
                              <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Win Rate</p>
                            </div>
                          </CardContent>
                        </Card>
                       );
                     })}
                  </div>
               </div>

               <div className="space-y-6">
                  <h2 className="text-2xl font-black text-slate-900">Top Statistics</h2>
                  <Card className="border-none bg-slate-900 text-white overflow-hidden">
                    <div className="p-6 space-y-6">
                       <div className="space-y-4">
                          <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Most Wins</p>
                          {[...players].sort((a, b) => (b.stats?.wins || 0) - (a.stats?.wins || 0)).slice(0, 3).map((p, i) => (
                             <div key={p.id} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                   <span className="text-lg font-black text-white/20 italic">#0{i+1}</span>
                                   <p className="font-bold text-sm truncate max-w-[120px]">{p.name || p.teamName}</p>
                                </div>
                                <span className="font-black text-blue-400">{p.stats?.wins || 0} Wins</span>
                             </div>
                          ))}
                       </div>
                       
                       <div className="h-px bg-white/10" />

                       <div className="space-y-4">
                          <p className="text-[10px] font-black text-green-400 uppercase tracking-widest">Active Players</p>
                          <div className="grid grid-cols-2 gap-4">
                             <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                                <p className="text-2xl font-black">{players.filter(p => p.category === 'singles').length}</p>
                                <p className="text-[10px] font-bold text-white/40 uppercase">Singles</p>
                             </div>
                             <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                                <p className="text-2xl font-black">{players.filter(p => p.category === 'doubles' || p.category === 'mixed').length}</p>
                                <p className="text-[10px] font-bold text-white/40 uppercase">Pairs</p>
                             </div>
                          </div>
                       </div>
                    </div>
                  </Card>
               </div>
            </div>
          </TabsContent>

          {/* Results Section */}
          <TabsContent value="results" className="mt-0">
             <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
                <CardHeader className="bg-slate-50 border-b border-slate-100">
                  <CardTitle>Match History</CardTitle>
                </CardHeader>
                <div className="p-0">
                   <div className="divide-y divide-slate-50">
                      {completedMatches.map(m => (
                        <div key={m.id} className="p-8 flex flex-col md:flex-row items-center gap-8 group hover:bg-slate-50/50 transition-all">
                           <div className="flex-1 text-center md:text-right space-y-2">
                              <p className={cn("text-2xl font-black", m.score1 > m.score2 ? "text-slate-900" : "text-slate-400")}>{m.player1}</p>
                              {m.score1 > m.score2 && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">WINNER</Badge>}
                           </div>
                           
                           <div className="flex flex-col items-center gap-2">
                              <div className="flex items-center gap-4">
                                 <span className="text-4xl font-black text-slate-900">{m.score1}</span>
                                 <div className="text-slate-200 font-black text-xl italic px-4">VS</div>
                                 <span className="text-4xl font-black text-slate-900">{m.score2}</span>
                              </div>
                              <div className="flex gap-2">
                                 {m.sets?.map((s, i) => (
                                    <span key={i} className="text-[10px] font-black text-slate-400">{s.s1}-{s.s2}</span>
                                 ))}
                              </div>
                           </div>

                           <div className="flex-1 text-center md:text-left space-y-2">
                              <p className={cn("text-2xl font-black", m.score2 > m.score1 ? "text-slate-900" : "text-slate-400")}>{m.player2}</p>
                              {m.score2 > m.score1 && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">WINNER</Badge>}
                           </div>
                        </div>
                      ))}
                      {completedMatches.length === 0 && (
                         <div className="py-24 text-center">
                            <p className="text-slate-400 italic font-medium">No matches completed yet.</p>
                         </div>
                      )}
                   </div>
                </div>
             </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Floating Action Button (Audience Info) */}
      <div className="fixed bottom-8 right-8 z-50">
        <Tabs value={activeTab} className="hidden">
           {/* Shadow tabs for state management if needed */}
        </Tabs>
        <Dialog>
           <DialogTrigger render={<Button className="w-14 h-14 rounded-full bg-slate-900 shadow-2xl hover:scale-110 transition-all" />}>
              <Info className="w-6 h-6 text-white" />
           </DialogTrigger>
           <DialogContent className="max-w-md rounded-3xl">
              <DialogHeader>
                 <DialogTitle>Broadcast Information</DialogTitle>
                 <DialogDescription>Use this info to share the live feed</DialogDescription>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                 <div className="p-4 bg-slate-50 rounded-2xl space-y-1 border border-slate-100">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tournament Link</p>
                    <code className="text-xs break-all block py-2">{window.location.href}</code>
                 </div>
                 <div className="p-4 bg-blue-50 rounded-2xl space-y-1 border border-blue-100">
                    <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Public Access PIN</p>
                    <p className="text-4xl font-black text-blue-600 font-mono tracking-widest">{tournament.audiencePin}</p>
                 </div>
              </div>
           </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
