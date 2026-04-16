import * as React from 'react';
import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, getDocs, where } from 'firebase/firestore';
import { License, AppUser } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Shield, Key, Users, Calendar, Plus, Search, CheckCircle, XCircle, Clock, Filter, Trash2, Eye, Ban, Trophy, QrCode, LogOut, ChevronDown, ChevronUp } from 'lucide-react';
import { Tournament } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';

export default function SuperadminDashboard({ onResetSystem }: { onResetSystem?: () => Promise<void> }) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'licenses' | 'users' | 'overview' | 'tournaments'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [licenseToRevoke, setLicenseToRevoke] = useState<{id: string, userId?: string, email: string} | null>(null);
  const [selectedTournamentForQR, setSelectedTournamentForQR] = useState<Tournament | null>(null);

  useEffect(() => {
    console.log("SuperadminDashboard: Setting up listeners...");
    const unsubLicenses = onSnapshot(collection(db, 'licenses'), (snapshot) => {
      setLicenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as License)));
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as AppUser)));
    });

    const unsubTournaments = onSnapshot(collection(db, 'tournaments'), (snapshot) => {
      setTournaments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament)));
    });

    setLoading(false);
    return () => {
      unsubLicenses();
      unsubUsers();
      unsubTournaments();
    };
  }, []);

  const revokeLicense = async (licenseId: string, userId?: string) => {
    try {
      await updateDoc(doc(db, 'licenses', licenseId), {
        status: 'expired',
        validUntil: new Date(0).toISOString() // Set to epoch to ensure it's expired
      });

      if (userId) {
        await updateDoc(doc(db, 'users', userId), {
          licenseValidUntil: new Date(0).toISOString()
        });
      }
      setLicenseToRevoke(null);
      alert("License revoked successfully.");
    } catch (error) {
      console.error("Error revoking license:", error);
      alert("Failed to revoke license.");
    }
  };

  const generateLicense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    console.log("SuperadminDashboard: Generating license...");
    const formData = new FormData(e.currentTarget);
    const email = (formData.get('email') as string).toLowerCase();
    const type = formData.get('type') as License['type'];
    
    try {
      let days = 1;
      if (type === 'multi') days = 7;
      if (type === 'monthly') days = 30;
      if (type === 'annual') days = 365;

      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + days);

      const newLicense: Omit<License, 'id'> = {
        organizerEmail: email,
        accessPin: Math.random().toString(36).substring(2, 8).toUpperCase(),
        type,
        validUntil: validUntil.toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending'
      };

      console.log("SuperadminDashboard: Adding license to Firestore...", newLicense);
      const licenseRef = await addDoc(collection(db, 'licenses'), newLicense);
      console.log("SuperadminDashboard: License added with ID:", licenseRef.id);

      // Send email via Firebase Trigger Email extension
      console.log("SuperadminDashboard: Adding mail to Firestore...");
      await addDoc(collection(db, 'mail'), {
        to: email,
        message: {
          subject: 'Welcome to SmashTrack - Your Organizer Activation PIN',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
              <h1 style="color: #2563eb; font-size: 24px; font-weight: 800; margin-bottom: 16px;">Welcome to SmashTrack!</h1>
              <p style="color: #475569; font-size: 16px; line-height: 1.5;">You have been invited to organize tournaments on SmashTrack. To get started, please use the activation PIN below.</p>
              
              <div style="background-color: #f8fafc; padding: 24px; border-radius: 8px; text-align: center; margin: 24px 0;">
                <p style="text-transform: uppercase; font-size: 12px; font-weight: 700; color: #94a3b8; letter-spacing: 0.1em; margin-bottom: 8px;">Your Activation PIN</p>
                <p style="font-family: monospace; font-size: 32px; font-weight: 900; color: #2563eb; letter-spacing: 0.2em; margin: 0;">${newLicense.accessPin}</p>
              </div>

              <p style="color: #475569; font-size: 16px; line-height: 1.5;">Click the link below to log in and enter your PIN:</p>
              
              <a href="${window.location.origin}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px;">Go to SmashTrack Dashboard</a>
              
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
              
              <p style="color: #94a3b8; font-size: 12px;">This license is a <strong>${type}</strong> subscription and is valid until ${validUntil.toLocaleDateString()}.</p>
            </div>
          `
        }
      });
      console.log("SuperadminDashboard: Mail added successfully");

      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error("SuperadminDashboard: Error generating license", error);
      alert("Failed to generate license. Check console for details.");
    }
  };

  const filteredLicenses = licenses.filter(l => 
    l.organizerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.accessPin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <div className="p-8 text-center">Loading System Management...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-600" />
            System Control
          </h1>
          <p className="text-slate-500">Manage licenses, organizers, and system health</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
          <Button 
            variant={activeTab === 'overview' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('overview')}
            className="rounded-lg"
          >Overview</Button>
          <Button 
            variant={activeTab === 'licenses' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('licenses')}
            className="rounded-lg"
          >Licenses</Button>
          <Button 
            variant={activeTab === 'tournaments' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('tournaments')}
            className="rounded-lg"
          >Tournaments</Button>
          <Button 
            variant={activeTab === 'users' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('users')}
            className="rounded-lg"
          >Organizers</Button>
          <div className="w-px bg-slate-200 mx-1 my-1" />
          <Button 
            variant="ghost" 
            onClick={() => {
              import('../firebase').then(m => m.auth.signOut());
            }}
            className="rounded-lg text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' && (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <Card className="border-none shadow-sm bg-blue-600 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-blue-100 uppercase tracking-wider">Total Organizers</CardTitle>
                <div className="text-4xl font-black">{users.filter(u => u.role === 'organizer').length}</div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-blue-100 text-xs">
                  <Users className="w-4 h-4" />
                  Registered system users
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-slate-900 text-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">Total Tournaments</CardTitle>
                <div className="text-4xl font-black">{tournaments.length}</div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <Trophy className="w-4 h-4 text-blue-500" />
                  Events created across platform
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">Active Licenses</CardTitle>
                <div className="text-4xl font-black text-green-600">{licenses.filter(l => l.status === 'active').length}</div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Currently valid access
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">Expired Licenses</CardTitle>
                <div className="text-4xl font-black text-red-600">{licenses.filter(l => l.status === 'expired').length}</div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <XCircle className="w-4 h-4 text-red-500" />
                  Revoked or timed out
                </div>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">Pending Activation</CardTitle>
                <div className="text-4xl font-black text-orange-500">{licenses.filter(l => l.status === 'pending').length}</div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Awaiting organizer login
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-400 uppercase tracking-wider">System Health</CardTitle>
                <div className="text-4xl font-black text-blue-600">Stable</div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                  <Shield className="w-4 h-4 text-blue-500" />
                  All services operational
                </div>
                {onResetSystem && (
                  <Dialog>
                    <DialogTrigger render={<Button variant="outline" size="sm" className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 border-red-100" />}>
                      <Trash2 className="w-3.5 h-3.5 mr-2" /> Reset Database
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="text-red-600">Reset System Database?</DialogTitle>
                        <DialogDescription>
                          This will delete ALL tournaments, matches, players, umpires, and licenses. This action is irreversible.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="flex gap-3 mt-4">
                        <Button variant="outline" className="flex-1" onClick={() => {}}>Cancel</Button>
                        <Button variant="destructive" className="flex-1" onClick={onResetSystem}>Clear Everything</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2 border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Recent License Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {licenses.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map(l => (
                    <div key={l.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="bg-white p-2 rounded-lg shadow-sm">
                          <Key className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-900">{l.organizerEmail}</p>
                          <p className="text-[10px] text-slate-500 uppercase font-medium">{l.type} License</p>
                        </div>
                      </div>
                      <Badge variant={l.status === 'active' ? 'default' : l.status === 'expired' ? 'destructive' : 'secondary'}>{l.status}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Quick Generate</CardTitle>
                <CardDescription>Issue a new access PIN</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={generateLicense} className="space-y-4">
                  <Input name="email" placeholder="Organizer Email" required />
                  <select name="type" className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm">
                    <option value="1day">1 Day Access</option>
                    <option value="multi">7 Days Access</option>
                    <option value="monthly">Monthly Subscription</option>
                    <option value="annual">Annual Subscription</option>
                  </select>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">
                    <Plus className="w-4 h-4 mr-2" /> Generate PIN
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {activeTab === 'licenses' && (
          <motion.div 
            key="licenses"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <Search className="w-5 h-5 text-slate-400" />
              <Input 
                placeholder="Search by email or PIN..." 
                className="border-none shadow-none focus-visible:ring-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Card className="border-none shadow-sm overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead>Organizer Email</TableHead>
                    <TableHead>Access PIN</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLicenses.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="font-medium">{l.organizerEmail}</TableCell>
                      <TableCell><code className="bg-slate-100 px-2 py-1 rounded font-bold text-blue-600">{l.accessPin}</code></TableCell>
                      <TableCell className="capitalize">{l.type}</TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {new Date(l.validUntil).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={l.status === 'active' ? 'default' : l.status === 'expired' ? 'destructive' : 'secondary'}>
                            {l.status}
                          </Badge>
                          {l.status === 'active' && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                              onClick={() => setLicenseToRevoke({ id: l.id!, userId: l.usedByUid, email: l.organizerEmail })}
                              title="Revoke License"
                            >
                              <Ban className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </motion.div>
        )}

        {activeTab === 'tournaments' && (
          <motion.div 
            key="tournaments"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <Search className="w-5 h-5 text-slate-400" />
              <Input 
                placeholder="Search tournaments or venues..." 
                className="border-none shadow-none focus-visible:ring-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Card className="border-none shadow-sm overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead>Tournament Name</TableHead>
                    <TableHead>Organizer</TableHead>
                    <TableHead>Venue</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Courts</TableHead>
                    <TableHead>PINs</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tournaments
                    .filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.venue.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map((t) => {
                      const organizer = users.find(u => u.uid === t.organizerId);
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-bold">{t.name}</TableCell>
                          <TableCell className="text-xs">{organizer?.email || 'Unknown'}</TableCell>
                          <TableCell className="text-xs">{t.venue}</TableCell>
                          <TableCell className="text-xs">{t.date}</TableCell>
                          <TableCell className="text-center">{t.numCourts}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="text-[10px] font-mono">U: {t.umpirePin}</Badge>
                              <Badge variant="outline" className="text-[10px] font-mono">A: {t.audiencePin}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-8 gap-1"
                              onClick={() => setSelectedTournamentForQR(t)}
                            >
                              <QrCode className="w-3.5 h-3.5" /> Share
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </Card>

            <Dialog open={!!selectedTournamentForQR} onOpenChange={() => setSelectedTournamentForQR(null)}>
              <DialogContent className="sm:max-w-2xl text-center">
                <DialogHeader>
                  <DialogTitle>Tournament Access: {selectedTournamentForQR?.name}</DialogTitle>
                  <DialogDescription>Share these QR codes for instant access</DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-6">
                  <div className="space-y-4 p-6 bg-blue-50 rounded-3xl border border-blue-100">
                    <div className="flex items-center justify-center gap-2 text-blue-600 font-bold uppercase tracking-widest text-xs">
                      <Shield className="w-4 h-4" /> Umpire Access
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm inline-block">
                      <QRCodeSVG value={selectedTournamentForQR?.umpirePin || ''} size={180} />
                    </div>
                    <div>
                      <p className="text-2xl font-mono font-black text-blue-600 tracking-widest">{selectedTournamentForQR?.umpirePin}</p>
                      <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Umpire PIN</p>
                    </div>
                  </div>

                  <div className="space-y-4 p-6 bg-green-50 rounded-3xl border border-green-100">
                    <div className="flex items-center justify-center gap-2 text-green-600 font-bold uppercase tracking-widest text-xs">
                      <Users className="w-4 h-4" /> Audience Access
                    </div>
                    <div className="bg-white p-4 rounded-2xl shadow-sm inline-block">
                      <QRCodeSVG value={selectedTournamentForQR?.audiencePin || ''} size={180} />
                    </div>
                    <div>
                      <p className="text-2xl font-mono font-black text-green-600 tracking-widest">{selectedTournamentForQR?.audiencePin}</p>
                      <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold">Audience PIN</p>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </motion.div>
        )}

        {activeTab === 'users' && (
          <motion.div 
            key="users"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="flex items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <Search className="w-5 h-5 text-slate-400" />
              <Input 
                placeholder="Search organizers..." 
                className="border-none shadow-none focus-visible:ring-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Card className="border-none shadow-sm overflow-hidden bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>License ID</TableHead>
                    <TableHead>Validity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((u) => {
                    const orgTournaments = tournaments.filter(t => t.organizerId === u.uid);
                    const isExpanded = expandedUserId === u.uid;

                    return (
                      <React.Fragment key={u.uid}>
                        <TableRow 
                          className="cursor-pointer hover:bg-slate-50 transition-colors"
                          onClick={() => setExpandedUserId(isExpanded ? null : u.uid)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              {u.email}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={u.role === 'superadmin' ? 'destructive' : 'default'}>
                              {u.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 font-mono">{u.licenseId || 'None'}</TableCell>
                          <TableCell className="text-xs">
                            {u.licenseValidUntil ? (
                              <span className={new Date(u.licenseValidUntil) < new Date() ? 'text-red-500 font-bold' : 'text-green-600'}>
                                {new Date(u.licenseValidUntil).toLocaleDateString()}
                              </span>
                            ) : 'N/A'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                              {orgTournaments.length} Events
                            </Badge>
                          </TableCell>
                        </TableRow>
                        <AnimatePresence>
                          {isExpanded && (
                            <TableRow className="bg-slate-50/50 border-b border-slate-100">
                              <TableCell colSpan={5} className="p-0">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-6 space-y-4">
                                    <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                      <Trophy className="w-4 h-4 text-blue-600" />
                                      Tournaments Organized by {u.email}
                                    </h4>
                                    {orgTournaments.length === 0 ? (
                                      <p className="text-xs text-slate-400 italic py-4">No tournaments created yet.</p>
                                    ) : (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                        {orgTournaments.map(t => (
                                          <Card key={t.id} className="bg-white border-slate-200 shadow-sm">
                                            <CardHeader className="p-4">
                                              <CardTitle className="text-sm">{t.name}</CardTitle>
                                              <CardDescription className="text-[10px]">{t.venue}</CardDescription>
                                            </CardHeader>
                                            <CardContent className="p-4 pt-0 flex justify-between items-center">
                                              <span className="text-[10px] text-slate-500">{t.date}</span>
                                              <Badge variant="outline" className="text-[10px]">{t.numCourts} Courts</Badge>
                                            </CardContent>
                                          </Card>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              </TableCell>
                            </TableRow>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            <Dialog open={!!licenseToRevoke} onOpenChange={(open) => !open && setLicenseToRevoke(null)}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-red-600">
                    <Ban className="w-5 h-5" /> Revoke License
                  </DialogTitle>
                  <CardDescription className="pt-2">
                    Are you sure you want to revoke the license for <strong className="text-slate-900">{licenseToRevoke?.email}</strong>?
                  </CardDescription>
                </DialogHeader>
                <div className="bg-red-50 p-4 rounded-xl border border-red-100 mt-2">
                  <p className="text-xs text-red-700 leading-relaxed">
                    <strong>Warning:</strong> This action is immediate. The organizer will lose all access to their dashboard and tournaments. This cannot be undone easily.
                  </p>
                </div>
                <div className="flex gap-3 mt-4">
                  <Button 
                    variant="outline" 
                    className="flex-1" 
                    onClick={() => setLicenseToRevoke(null)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    className="flex-1"
                    onClick={() => licenseToRevoke && revokeLicense(licenseToRevoke.id, licenseToRevoke.userId)}
                  >
                    Confirm Revocation
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
