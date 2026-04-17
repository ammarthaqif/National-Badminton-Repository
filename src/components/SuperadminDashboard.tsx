import * as React from 'react';
import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { collection, query, onSnapshot, addDoc, updateDoc, doc, getDocs, where, setDoc, deleteDoc } from 'firebase/firestore';
import { License, AppUser, Tournament, Match, Player, Umpire, SanctionedInstitution } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Badge } from './ui/badge';
import { Shield, Key, Users, Calendar, Plus, Search, CheckCircle, XCircle, Clock, Filter, Trash2, Eye, Ban, Trophy, QrCode, LogOut, ChevronDown, ChevronUp, Smartphone, Edit2, Download, FileUp, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from './ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';

export default function SuperadminDashboard({ 
  onResetSystem,
  onHome,
  onViewAsRole,
  addNotification
}: { 
  onResetSystem?: () => Promise<void>;
  onHome?: () => void;
  onViewAsRole?: (tournament: Tournament, role: 'umpire' | 'audience') => void;
  addNotification?: (message: string, type?: 'info' | 'success' | 'warning') => void;
}) {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [institutions, setInstitutions] = useState<SanctionedInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'licenses' | 'users' | 'overview' | 'tournaments' | 'institutions' | 'system'>('overview');
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [licenseToRevoke, setLicenseToRevoke] = useState<{id: string, userId?: string, email: string} | null>(null);
  const [selectedTournamentForQR, setSelectedTournamentForQR] = useState<Tournament | null>(null);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [isGeneratingLicense, setIsGeneratingLicense] = useState(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [lastGeneratedLicense, setLastGeneratedLicense] = useState<{email: string, pin: string} | null>(null);
  const [institutionToDelete, setInstitutionToDelete] = useState<SanctionedInstitution | null>(null);

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

    const unsubInstitutions = onSnapshot(collection(db, 'institutions'), (snapshot) => {
      setInstitutions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SanctionedInstitution)));
    });

    setLoading(false);
    return () => {
      unsubLicenses();
      unsubUsers();
      unsubTournaments();
      unsubInstitutions();
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
      addNotification?.("License revoked successfully.", "success");
    } catch (error) {
      console.error("Error revoking license:", error);
      addNotification?.("Failed to revoke license.", "warning");
    }
  };

  const exportDatabase = async () => {
    setIsExporting(true);
    try {
      const data: any = {
        users: [],
        tournaments: [],
        licenses: [],
        timestamp: new Date().toISOString()
      };

      // 1. Get Users
      const usersSnap = await getDocs(collection(db, 'users'));
      data.users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Get Licenses
      const licensesSnap = await getDocs(collection(db, 'licenses'));
      data.licenses = licensesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Get Tournaments and subcollections
      const tournamentsSnap = await getDocs(collection(db, 'tournaments'));
      for (const tDoc of tournamentsSnap.docs) {
        const t = { id: tDoc.id, ...tDoc.data() } as any;
        
        // Matches
        const matchesSnap = await getDocs(collection(db, `tournaments/${tDoc.id}/matches`));
        t.matches = matchesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Players
        const playersSnap = await getDocs(collection(db, `tournaments/${tDoc.id}/players`));
        t.players = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Umpires
        const umpiresSnap = await getDocs(collection(db, `tournaments/${tDoc.id}/umpires`));
        t.umpires = umpiresSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        data.tournaments.push(t);
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `smash-track-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      addNotification?.("Database export completed successfully.", "success");
    } catch (error) {
      console.error("Export failed:", error);
      addNotification?.("Failed to export database.", "warning");
    } finally {
      setIsExporting(false);
    }
  };

  const importDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress(0);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Simple validation
      if (!data.users || !data.tournaments || !data.licenses) {
        throw new Error("Invalid backup file format");
      }

      const totalItems = data.users.length + data.licenses.length + data.tournaments.length;
      let processed = 0;

      // 1. Restore Users
      for (const u of data.users) {
        const { id, ...uData } = u;
        await setDoc(doc(db, 'users', id), uData);
        processed++;
        setImportProgress(Math.round((processed / totalItems) * 100));
      }

      // 2. Restore Licenses
      for (const l of data.licenses) {
        const { id, ...lData } = l;
        await setDoc(doc(db, 'licenses', id), lData);
        processed++;
        setImportProgress(Math.round((processed / totalItems) * 100));
      }

      // 3. Restore Tournaments
      for (const t of data.tournaments) {
        const { id, matches, players, umpires, ...tData } = t;
        await setDoc(doc(db, 'tournaments', id), tData);
        
        // Subcollections
        if (matches) {
          for (const m of matches) {
            const { id: mId, ...mData } = m;
            await setDoc(doc(db, `tournaments/${id}/matches`, mId), mData);
          }
        }
        if (players) {
          for (const p of players) {
            const { id: pId, ...pData } = p;
            await setDoc(doc(db, `tournaments/${id}/players`, pId), pData);
          }
        }
        if (umpires) {
          for (const u of umpires) {
            const { id: uId, ...uData } = u;
            await setDoc(doc(db, `tournaments/${id}/umpires`, uId), uData);
          }
        }
        
        processed++;
        setImportProgress(Math.round((processed / totalItems) * 100));
      }

      addNotification?.("Database import completed successfully!", "success");
      setTimeout(() => window.location.reload(), 1500); 
    } catch (error: any) {
      console.error("Import failed:", error);
      addNotification?.(`Import failed: ${error.message}`, "warning");
    } finally {
      setIsImporting(false);
    }
  };

  const handleManualUserUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUser) return;
    const formData = new FormData(e.currentTarget);
    const updates = {
      role: formData.get('role') as string,
      licenseValidUntil: formData.get('validUntil') as string,
      email: formData.get('email') as string,
    };

    try {
      await updateDoc(doc(db, 'users', editingUser.uid), updates);
      setEditingUser(null);
      addNotification("User profile updated successfully.", "success");
    } catch (error) {
      console.error("Error updating user:", error);
      addNotification("Failed to update user profile.", "warning");
    }
  };

   const generateLicense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isGeneratingLicense) return;

    setIsGeneratingLicense(true);
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
          subject: 'Welcome to National Badminton Registry - Your Official Access PIN',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e8e5d5; border-radius: 12px; background-color: #fdfcf6;">
              <h1 style="color: #0c1222; font-size: 24px; font-weight: 800; margin-bottom: 16px;">National Badminton Registry</h1>
              <p style="color: #475569; font-size: 16px; line-height: 1.5;">You have been authorized as a Sanctioned Organizer for the National Badminton Registry. To activate your NBR Agency Status, please use the secure PIN below.</p>
              
              <div style="background-color: #ffffff; padding: 24px; border-radius: 8px; text-align: center; margin: 24px 0; border: 1px solid #c5a037;">
                <p style="text-transform: uppercase; font-size: 12px; font-weight: 700; color: #6b7280; letter-spacing: 0.1em; margin-bottom: 8px;">Your Security Activation PIN</p>
                <p style="font-family: monospace; font-size: 32px; font-weight: 900; color: #0c1222; letter-spacing: 0.2em; margin: 0;">${newLicense.accessPin}</p>
              </div>

              <p style="color: #475569; font-size: 16px; line-height: 1.5;">Access the registry portal and enter your PIN to begin:</p>
              
              <a href="${window.location.origin}" style="display: inline-block; background-color: #0c1222; color: #fdfcf6; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; border: 1px solid #c5a037;">NBR Access Portal</a>
              
              <hr style="border: 0; border-top: 1px solid #e8e5d5; margin: 32px 0;" />
              
              <p style="color: #94a3b8; font-size: 12px;">This NBR authorization is a <strong>${type}</strong> classification and is valid until ${validUntil.toLocaleDateString()}.</p>
            </div>
          `
        }
      });
      console.log("SuperadminDashboard: Mail added successfully");

      addNotification?.(`License PIN ${newLicense.accessPin} generated and sent to ${email}`, "success");
      setLastGeneratedLicense({ email, pin: newLicense.accessPin });
      setShowSuccessDialog(true);
      setIsRegisterModalOpen(false);
      (e.target as HTMLFormElement).reset();
    } catch (error) {
      console.error("SuperadminDashboard: Error generating license", error);
      addNotification?.("Failed to generate license. Check console for details.", "warning");
    } finally {
      setIsGeneratingLicense(false);
    }
  };

  const updateUserProfile = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingUser) return;
    const formData = new FormData(e.currentTarget);
    const role = formData.get('role') as AppUser['role'];
    const validUntil = formData.get('validUntil') as string;

    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        role,
        licenseValidUntil: validUntil ? new Date(validUntil).toISOString() : null
      });
      setEditingUser(null);
      addNotification?.("User profile updated successfully.", "success");
    } catch (error) {
      console.error("Error updating user profile:", error);
      addNotification?.("Failed to update user profile.", "warning");
    }
  };

  const filteredLicenses = licenses.filter(l => 
    l.organizerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.accessPin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingInvitations = licenses.filter(l => 
    l.status === 'pending' && 
    !users.some(u => u.email.toLowerCase() === l.organizerEmail.toLowerCase()) &&
    (l.organizerEmail.toLowerCase().includes(searchQuery.toLowerCase()) || l.accessPin.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) return <div className="p-8 text-center text-slate-500">
    <Clock className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
    Loading System Management...
  </div>;

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
            variant={activeTab === 'institutions' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('institutions')}
            className="rounded-lg"
          >Institutions</Button>
          <Button 
            variant={activeTab === 'users' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('users')}
            className="rounded-lg"
          >Organizers</Button>
          <Button 
            variant={activeTab === 'system' ? 'default' : 'ghost'} 
            onClick={() => setActiveTab('system')}
            className="rounded-lg"
          >System</Button>
          <Button 
            variant="ghost" 
            onClick={onHome}
            className="rounded-lg mr-2"
          >
            <Trophy className="w-4 h-4 mr-2" /> Landing Page
          </Button>
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

            <Card className="md:col-span-2 border-none shadow-sm bg-white overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-5 h-5 text-blue-600" />
                  Recent License Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="w-[100px] text-[10px] uppercase font-bold text-slate-400">Activity</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-slate-400">License (PIN)</TableHead>
                      <TableHead className="text-[10px] uppercase font-bold text-slate-400">Organizer Email</TableHead>
                      <TableHead className="text-right text-[10px] uppercase font-bold text-slate-400">Timestamp</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {licenses
                      .filter(l => l.lastLoginAt)
                      .sort((a, b) => (b.lastLoginAt || '').localeCompare(a.lastLoginAt || ''))
                      .slice(0, 5)
                      .map(l => (
                        <TableRow key={l.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell>
                            <Badge variant={l.status === 'active' ? 'default' : l.status === 'expired' ? 'destructive' : 'secondary'} className="text-[9px] px-1.5 h-5">
                              {l.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <code className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold border border-blue-100">{l.accessPin}</code>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-700">{l.organizerEmail}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-[10px] font-mono text-slate-400">
                              {l.lastLoginAt ? new Date(l.lastLoginAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'No Activity'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle>Quick Generate</CardTitle>
                <CardDescription>Issue a new access PIN</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={generateLicense} className="space-y-4">
                  <Input name="email" placeholder="Organizer Email" required disabled={isGeneratingLicense} />
                  <select name="type" className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm" disabled={isGeneratingLicense}>
                    <option value="1day">1 Day Access</option>
                    <option value="multi">7 Days Access</option>
                    <option value="monthly">Monthly Subscription</option>
                    <option value="annual">Annual Subscription</option>
                  </select>
                  <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isGeneratingLicense}>
                    {isGeneratingLicense ? (
                      <span className="flex items-center gap-2">
                        <Clock className="w-4 h-4 animate-spin" /> Generating...
                      </span>
                    ) : (
                      <>
                        <Plus className="w-4 h-4 mr-2" /> Generate PIN
                      </>
                    )}
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
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="bg-slate-100 px-2 py-1 rounded font-bold text-blue-600">
                            {l.accessPin}
                          </code>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 text-slate-400 hover:text-blue-600"
                            onClick={() => {
                              navigator.clipboard.writeText(l.accessPin);
                              addNotification?.("PIN copied!", "success");
                            }}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
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
                      // Try to find the license either by the tournament's licenseId OR by the UID that was linked to it
                      const linkedLicense = licenses.find(l => l.id === t.licenseId || (t.organizerId && l.usedByUid === t.organizerId));
                      
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="font-bold">{t.name}</TableCell>
                          <TableCell className="text-xs">
                            {organizer?.email || (linkedLicense ? (
                              <span className="flex items-center gap-1">
                                {linkedLicense.organizerEmail} 
                                <Badge variant="outline" className="text-[8px] h-3 px-1 border-blue-200 text-blue-600 bg-blue-50">
                                  {t.licenseId ? 'Linked' : 'via session'}
                                </Badge>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic" title={t.organizerId}>Unknown ({t.organizerId?.substring(0, 8)}...)</span>
                            ))}
                          </TableCell>
                          <TableCell className="text-xs">{t.date}</TableCell>
                          <TableCell className="text-center">{t.numCourts}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="text-[10px] font-mono">U: {t.umpirePin}</Badge>
                              <Badge variant="outline" className="text-[10px] font-mono">A: {t.audiencePin}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 gap-1 text-slate-600 hover:bg-slate-100"
                                onClick={() => onViewAsRole?.(t, 'audience')}
                              >
                                <Eye className="w-3.5 h-3.5" /> View
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 gap-1 text-blue-600 hover:bg-blue-50"
                                onClick={() => onViewAsRole?.(t, 'umpire')}
                              >
                                <Smartphone className="w-3.5 h-3.5" /> Score
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-8 gap-1"
                                onClick={() => setSelectedTournamentForQR(t)}
                              >
                                <QrCode className="w-3.5 h-3.5" /> Share
                              </Button>
                            </div>
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

        {activeTab === 'system' && (
          <motion.div 
            key="system"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-6"
          >
            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-600" />
                  Database Maintenance & Backup
                </CardTitle>
                <CardDescription>Export and import the full system state for backup and recovery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-600 p-2 rounded-lg">
                        <Download className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-bold text-blue-900">Export Full Database</h4>
                        <p className="text-xs text-blue-600 mt-1">Downloads a JSON snapshot of all system data</p>
                      </div>
                    </div>
                    <Button 
                      onClick={exportDatabase} 
                      disabled={isExporting}
                      className="w-full bg-blue-600 hover:bg-blue-700 mt-2"
                    >
                      {isExporting ? "Exporting..." : "Generate Backup (JSON)"}
                    </Button>
                  </div>

                  <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-900 p-2 rounded-lg">
                        <FileUp className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">Import Database</h4>
                        <p className="text-xs text-slate-500 mt-1">Restore system state from a previous backup</p>
                      </div>
                    </div>
                    <div className="relative group">
                      <input 
                        type="file" 
                        accept=".json" 
                        onChange={importDatabase} 
                        disabled={isImporting}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <Button 
                        variant="outline" 
                        disabled={isImporting}
                        className="w-full border-slate-300 group-hover:bg-slate-100"
                      >
                        {isImporting ? `Importing ${importProgress}%...` : "Choose Backup File"}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex gap-3">
                  <Filter className="w-5 h-5 text-orange-500 shrink-0" />
                  <div>
                    <h5 className="text-sm font-bold text-orange-900">Safe Import Instructions</h5>
                    <p className="text-xs text-orange-700 mt-1 leading-relaxed">
                      For best results, use the "Reset Database" feature in the Overview tab before importing a full backup. This ensures no document ID collisions or stale data relationships.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
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
              <div className="flex-1 flex items-center gap-4">
                <Search className="w-5 h-5 text-slate-400" />
                <Input 
                  placeholder="Search organizers..." 
                  className="border-none shadow-none focus-visible:ring-0"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Dialog open={isRegisterModalOpen} onOpenChange={setIsRegisterModalOpen}>
                <DialogTrigger render={<Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" /> Register Organizer
                </Button>}>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Register New Organizer</DialogTitle>
                    <DialogDescription>
                      Issue a new license and register their account email.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    await generateLicense(e);
                  }} className="space-y-4 pt-4">
                    <div className="space-y-2">
                       <label className="text-sm font-medium">Account Email</label>
                       <Input name="email" placeholder="organizer@example.com" required disabled={isGeneratingLicense} />
                    </div>
                    <div className="space-y-2">
                       <label className="text-sm font-medium">License Type</label>
                       <select name="type" className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm" disabled={isGeneratingLicense}>
                          <option value="1day">1 Day Access</option>
                          <option value="multi">7 Days Access (Multi)</option>
                          <option value="monthly">Monthly Subscription</option>
                          <option value="annual">Annual Subscription</option>
                       </select>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                       <Info className="w-5 h-5 text-blue-500 shrink-0" />
                       <p className="text-xs text-blue-700 leading-relaxed">
                          Registering an organizer will generate a unique activation PIN and send it via email if the mail service is active.
                       </p>
                    </div>
                    <Button type="submit" className="w-full bg-blue-600" disabled={isGeneratingLicense}>
                      {isGeneratingLicense ? "Processing..." : "Complete Registration"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
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
                  {pendingInvitations.map((l) => (
                    <TableRow key={l.id} className="bg-orange-50/30">
                      <TableCell className="font-medium italic text-slate-600">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-orange-400" />
                          {l.organizerEmail}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-orange-200 text-orange-600 bg-orange-50">
                          Pending
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">
                         <div className="flex items-center gap-2">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{l.accessPin}</span>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-5 w-5 text-slate-400 hover:text-blue-600"
                              onClick={() => {
                                navigator.clipboard.writeText(l.accessPin);
                                addNotification?.("PIN copied!", "success");
                              }}
                            >
                              <Download className="w-3 h-3" />
                            </Button>
                         </div>
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">
                        Expires {new Date(l.validUntil).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setLicenseToRevoke({ id: l.id!, userId: undefined, email: l.organizerEmail })}
                        >
                          Cancel Invite
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
                          <TableCell className="text-right font-medium">
                            <div className="flex justify-end gap-2">
                              <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                                {orgTournaments.length} Events
                              </Badge>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400 hover:text-blue-600"
                                onClick={(e) => { e.stopPropagation(); setEditingUser(u); }}
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              {u.uid !== auth.currentUser?.uid && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 text-slate-400 hover:text-red-500 hover:bg-red-50"
                                  onClick={async (e) => { 
                      e.stopPropagation(); 
                      // Using a custom flow or just proceeding if the user is superadmin
                      // Since we are inside a Superadmin view and this is a sensitive action
                      // we'll rely on the fact that this is an administrative delete.
                      // For a better UX, I'll add a state for confirmation if needed, 
                      // but for now let's just use the addNotification to verify completion.
                      try {
                        await deleteDoc(doc(db, 'users', u.uid));
                        addNotification(`Organizer ${u.email} deleted.`, "success");
                      } catch (err) {
                        handleFirestoreError(err, OperationType.WRITE, `users/${u.uid}`);
                        addNotification("Delete failed.", "warning");
                      }
                    }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
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
                                              <div className="flex gap-2">
                                                <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2" onClick={() => onViewAsRole?.(t, 'audience')}>View</Button>
                                                <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-blue-600" onClick={() => onViewAsRole?.(t, 'umpire')}>Scoring</Button>
                                              </div>
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

            <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-600" /> Edit Organizer Profile
                  </DialogTitle>
                  <DialogDescription>
                    Update permissions and role for <strong className="text-slate-900">{editingUser?.email}</strong>
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={updateUserProfile} className="space-y-4 pt-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">System Role</label>
                    <select name="role" defaultValue={editingUser?.role} className="w-full h-10 px-3 rounded-md border border-slate-200 text-sm">
                      <option value="user">User (Basic Access)</option>
                      <option value="organizer">Organizer (Tournament Management)</option>
                      <option value="superadmin">Superadmin (System Control)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase">License Valid Until</label>
                    <Input 
                      name="validUntil" 
                      type="datetime-local" 
                      defaultValue={editingUser?.licenseValidUntil ? new Date(editingUser.licenseValidUntil).toISOString().slice(0, 16) : ''} 
                    />
                  </div>
                  <div className="flex gap-3 pt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      className="flex-1" 
                      onClick={() => setEditingUser(null)}
                    >
                      Cancel
                    </Button>
                    <Button 
                      type="submit"
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                    >
                      Save Changes
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </motion.div>
        )}

        {activeTab === 'institutions' && (
          <motion.div 
            key="institutions"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
             <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4 bg-white p-2 px-4 rounded-2xl border border-slate-200 shadow-sm w-full md:max-w-md">
                <Search className="w-5 h-5 text-slate-400" />
                <Input 
                  placeholder="Filter institutions..." 
                  className="border-none shadow-none focus-visible:ring-0"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button className="bg-[#0C1222] text-white rounded-xl h-12 px-6 shadow-lg shadow-slate-200">
                    <Plus className="w-4 h-4 mr-2" /> Sanction Institution
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                       <Shield className="w-6 h-6 text-[#C5A037]" />
                       Sanction New Institution
                    </DialogTitle>
                    <DialogDescription>Add a school, university or club to the NBR official registry.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const newInst = {
                      name: formData.get('name') as string,
                      type: formData.get('type') as any,
                      region: formData.get('region') as string,
                      contactEmail: formData.get('email') as string,
                      registryId: `NBR-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
                      status: 'active'
                    };
                    try {
                      await addDoc(collection(db, 'institutions'), newInst);
                      addNotification?.('Institution sanctioned successfully.', 'success');
                      (e.target as HTMLFormElement).reset();
                    } catch (err) {
                      handleFirestoreError(err, OperationType.WRITE, 'institutions');
                    }
                  }} className="space-y-4 pt-4">
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase text-slate-400">Institution Name</label>
                       <Input name="name" placeholder="e.g. National University of Badminton" required />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-400">Type</label>
                        <select name="type" className="w-full h-10 px-3 rounded-md border text-sm" required>
                          <option value="School">School</option>
                          <option value="College">College</option>
                          <option value="University">University</option>
                          <option value="Professional Club">Professional Club</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-slate-400">Region</label>
                        <Input name="region" placeholder="e.g. Selangor" required />
                      </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-xs font-bold uppercase text-slate-400">Contact Email</label>
                       <Input name="email" type="email" placeholder="admin@univ.edu" required />
                    </div>
                    <Button type="submit" className="w-full bg-[#0C1222] text-white">Issue NBR Registry ID</Button>
                  </form>
                </DialogContent>
              </Dialog>
             </div>

             <Card className="border-none shadow-sm overflow-hidden bg-white">
               <Table>
                 <TableHeader>
                   <TableRow className="bg-slate-50/50">
                     <TableHead>Institution Name</TableHead>
                     <TableHead>Registry ID</TableHead>
                     <TableHead>Type</TableHead>
                     <TableHead>Region</TableHead>
                     <TableHead>Status</TableHead>
                     <TableHead className="text-right">Actions</TableHead>
                   </TableRow>
                 </TableHeader>
                 <TableBody>
                   {institutions
                     .filter(inst => inst.name.toLowerCase().includes(searchQuery.toLowerCase()))
                     .map((inst) => (
                     <TableRow key={inst.id}>
                       <TableCell className="font-bold text-slate-900">{inst.name}</TableCell>
                       <TableCell>
                         <code className="text-xs bg-slate-100 px-2 py-1 rounded font-mono text-blue-600">
                           {inst.registryId}
                         </code>
                       </TableCell>
                       <TableCell>
                         <Badge variant="secondary">{inst.type}</Badge>
                       </TableCell>
                       <TableCell className="text-slate-600">{inst.region}</TableCell>
                       <TableCell>
                         <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-green-500" />
                           <span className="text-xs font-bold text-green-700 uppercase">{inst.status}</span>
                         </div>
                       </TableCell>
                       <TableCell className="text-right">
                         <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-slate-400 hover:text-red-500 transition-colors" 
                              onClick={() => setInstitutionToDelete(inst)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                         </div>
                       </TableCell>
                     </TableRow>
                   ))}
                   {institutions.length === 0 && (
                     <TableRow>
                       <TableCell colSpan={6} className="text-center py-20 text-slate-400">
                         <div className="flex flex-col items-center gap-3">
                           <Shield className="w-12 h-12 text-slate-200" />
                           <p className="italic">No sanctioned institutions registered in system.</p>
                         </div>
                       </TableCell>
                     </TableRow>
                   )}
                 </TableBody>
               </Table>
             </Card>

             <Dialog open={!!institutionToDelete} onOpenChange={(open) => !open && setInstitutionToDelete(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="text-red-600">Revoke Sanction</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to revoke the NBR sanction for <strong>{institutionToDelete?.name}</strong>? 
                      This will invalidate their registry status across all documents.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex gap-4 pt-4">
                    <Button variant="outline" className="flex-1" onClick={() => setInstitutionToDelete(null)}>Cancel</Button>
                    <Button variant="destructive" className="flex-1" onClick={async () => {
                      if(institutionToDelete?.id) {
                        try {
                          await deleteDoc(doc(db, 'institutions', institutionToDelete.id));
                          addNotification?.('Sanction revoked.', 'success');
                          setInstitutionToDelete(null);
                        } catch (err) {
                           handleFirestoreError(err, OperationType.WRITE, 'institutions');
                        }
                      }
                    }}>Revoke Status</Button>
                  </div>
                </DialogContent>
             </Dialog>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent className="sm:max-w-[500px] border-none shadow-2xl overflow-hidden p-0">
          <div className="h-2 bg-gradient-to-r from-green-500 to-blue-500" />
          <div className="p-8">
            <DialogHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="bg-green-100 p-3 rounded-full">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              </div>
              <DialogTitle className="text-2xl font-black text-slate-900">Registration Success!</DialogTitle>
              <DialogDescription className="text-slate-500 pt-2">
                A new license has been issued for <strong>{lastGeneratedLicense?.email}</strong>
              </DialogDescription>
            </DialogHeader>

            <div className="mt-8 space-y-6">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Access PIN (Activation Code)</label>
                  <div className="flex items-center gap-3 mt-1">
                    <code className="flex-1 bg-white text-blue-600 text-2xl font-black p-4 rounded-xl border border-slate-200 tracking-widest text-center shadow-sm">
                      {lastGeneratedLicense?.pin}
                    </code>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-14 w-14 rounded-xl bg-white hover:bg-slate-50"
                      onClick={() => {
                        if (lastGeneratedLicense?.pin) {
                          navigator.clipboard.writeText(lastGeneratedLicense.pin);
                          addNotification?.("PIN copied to clipboard!", "success");
                        }
                      }}
                    >
                      <Download className="w-6 h-6 text-slate-400" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dashboard Link</label>
                  <div className="flex items-center gap-3 mt-1">
                    <Input 
                      readOnly 
                      value={window.location.origin} 
                      className="flex-1 bg-white h-12 rounded-xl text-slate-500 text-sm overflow-hidden" 
                    />
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-12 w-12 rounded-xl bg-white hover:bg-slate-50"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.origin);
                        addNotification?.("Link copied to clipboard!", "success");
                      }}
                    >
                      <Search className="w-4 h-4 text-slate-400" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex gap-3">
                <Info className="w-5 h-5 text-blue-500 shrink-0" />
                <p className="text-[10px] text-blue-700 leading-relaxed">
                  <strong>Note:</strong> We attempt to send an automated email via the Firebase Trigger Email service. If the organizer does not receive it, please manually provide them with the PIN above and the dashboard link.
                </p>
              </div>

              <Button 
                onClick={() => setShowSuccessDialog(false)} 
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-500/20"
              >
                Close & Continue
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
