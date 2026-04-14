import React, { useState, useEffect, Component } from 'react';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { collection, query, where, onSnapshot, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, limit, getDoc } from 'firebase/firestore';
import { Tournament, Match, Umpire, Player, AppUser, License, Notification } from './types';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Input } from './components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './components/ui/table';
import { Trophy, Users, Layout, Play, CheckCircle, QrCode, LogIn, LogOut, Plus, Trash2, Smartphone, Monitor, Search, FileUp, Download, Settings, ChevronDown, ChevronUp, Key } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import UmpireScoring from './components/UmpireScoring';
import AudienceView from './components/AudienceView';
import SuperadminDashboard from './components/SuperadminDashboard';

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends Component<any, any> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <Card className="max-w-md w-full border-red-100 shadow-xl">
            <CardHeader className="text-center">
              <div className="mx-auto bg-red-100 p-3 rounded-full w-fit mb-4">
                <Trophy className="w-8 h-8 text-red-600 rotate-180" />
              </div>
              <CardTitle className="text-red-900">Something went wrong</CardTitle>
              <CardDescription>
                The application encountered an unexpected error.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900 text-slate-100 p-4 rounded-lg text-xs font-mono overflow-auto max-h-40">
                {this.state.error?.message || String(this.state.error)}
              </div>
              <Button 
                className="w-full bg-slate-900" 
                onClick={() => window.location.reload()}
              >
                Reload Application
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// --- Components ---

const LoginView = ({ 
  onLogin, 
  loginLoading,
  onJoin, 
  tempTournament, 
  onSelectRole,
  onCancelJoin,
  onLicenseLogin
}: { 
  onLogin: () => void, 
  loginLoading: boolean,
  onJoin: (pin: string) => void,
  tempTournament: Tournament | null,
  onSelectRole: (role: 'umpire' | 'audience') => void,
  onCancelJoin: () => void,
  onLicenseLogin: (email: string, pin: string) => void
}) => {
  const [pin, setPin] = useState('');
  const [showLicenseForm, setShowLicenseForm] = useState(false);
  const [licenseEmail, setLicenseEmail] = useState('');
  const [licensePin, setLicensePin] = useState('');

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full"
      >
        <Card className="border-none shadow-xl bg-white">
          <CardHeader className="text-center space-y-4">
            <div className="mx-auto bg-blue-600 p-4 rounded-2xl w-fit shadow-lg shadow-blue-200">
              <Trophy className="w-12 h-12 text-white" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold tracking-tight text-slate-900">SmashTrack</CardTitle>
              <CardDescription className="text-slate-500 mt-2">Professional Badminton Tournament Management</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <AnimatePresence mode="wait">
              {!tempTournament ? (
                <motion.div
                  key="login"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="space-y-6"
                >
                  <div className="space-y-4 p-5 bg-slate-50 rounded-2xl border border-slate-100 shadow-inner">
                    <div className="text-center mb-2">
                      <h4 className="font-bold text-slate-900">Organizer Access</h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest">License Credentials</p>
                    </div>
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Registered Email</label>
                        <Input 
                          placeholder="email@example.com" 
                          type="email"
                          className="h-11 bg-white"
                          value={licenseEmail}
                          onChange={(e) => setLicenseEmail(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Access PIN</label>
                        <Input 
                          placeholder="••••••" 
                          type="password"
                          className="h-11 bg-white"
                          value={licensePin}
                          onChange={(e) => setLicensePin(e.target.value)}
                        />
                      </div>
                      <Button 
                        type="button"
                        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-100 mt-2" 
                        onClick={() => onLicenseLogin(licenseEmail, licensePin)}
                        disabled={loginLoading || !licenseEmail || !licensePin}
                      >
                        {loginLoading ? (
                          <div className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Verifying...
                          </div>
                        ) : (
                          "Login as Organizer"
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="text-center">
                    <button 
                      type="button"
                      className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors font-medium underline underline-offset-4"
                      onClick={onLogin}
                    >
                      System Administrator Login (Google)
                    </button>
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200"></span></div>
                    <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-slate-400">Or join as audience/umpire</span></div>
                  </div>
                  <div className="space-y-3">
                    <Input 
                      placeholder="Enter Tournament PIN" 
                      className="h-12 text-center text-xl tracking-widest font-mono uppercase" 
                      value={pin}
                      onChange={(e) => setPin(e.target.value.toUpperCase())}
                    />
                    <Button 
                      variant="outline" 
                      type="button"
                      className="w-full h-12 text-slate-600 border-slate-200 hover:bg-slate-50"
                      onClick={() => onJoin(pin)}
                      disabled={!pin}
                    >
                      <Search className="mr-2 h-4 w-4" /> Join Tournament
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="role-selection"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="space-y-6 text-center"
                >
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                    <p className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Tournament Found</p>
                    <h3 className="text-xl font-bold text-slate-900">{tempTournament.name}</h3>
                  </div>
                  <p className="text-sm text-slate-500">Select your role to continue</p>
                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col gap-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-all"
                      onClick={() => onSelectRole('umpire')}
                    >
                      <Smartphone className="w-6 h-6" />
                      <span>Umpire</span>
                    </Button>
                    <Button 
                      variant="outline" 
                      className="h-24 flex flex-col gap-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-600 transition-all"
                      onClick={() => onSelectRole('audience')}
                    >
                      <Monitor className="w-6 h-6" />
                      <span>Audience</span>
                    </Button>
                  </div>
                  <Button variant="ghost" className="w-full text-slate-400" onClick={onCancelJoin}>
                    Cancel
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
};

const LandingView = ({ onStart }: { onStart: () => void }) => {
  console.log("LandingView rendered");
  return (
    <div className="min-h-screen bg-white font-sans selection:bg-blue-100 selection:text-blue-600">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-black tracking-tight text-slate-900">SmashTrack</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#features" className="hover:text-blue-600 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-blue-600 transition-colors">Pricing</a>
            <Button type="button" onClick={() => { console.log("Nav button clicked"); onStart(); }} className="bg-blue-600 hover:bg-blue-700 shadow-xl shadow-blue-100 px-8 rounded-full">
              Launch Dashboard
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 text-blue-600 text-sm font-bold border border-blue-100"
          >
            <Badge className="bg-blue-600">NEW</Badge>
            <span>Real-time scoring for professional tournaments</span>
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-6xl md:text-8xl font-black tracking-tight text-slate-900 leading-[1.1]"
          >
            Elevate Your <br />
            <span className="text-blue-600">Badminton Events</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-2xl mx-auto text-xl text-slate-500 leading-relaxed"
          >
            The all-in-one platform for tournament organizers, umpires, and fans. 
            Real-time updates, automated scheduling, and professional branding.
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Button type="button" onClick={() => { console.log("Hero button clicked"); onStart(); }} size="lg" className="h-16 px-10 text-lg font-bold bg-blue-600 hover:bg-blue-700 rounded-2xl shadow-2xl shadow-blue-200">
              Access Dashboard
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-16 px-10 text-lg font-bold border-slate-200 rounded-2xl">
              Watch Demo
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16 space-y-4">
            <h2 className="text-4xl font-black text-slate-900">Professional Features</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Everything you need to run a world-class tournament from your pocket.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { icon: <Smartphone className="w-8 h-8" />, title: "Umpire Dashboard", desc: "Intuitive scoring interface with undo, server tracking, and set management." },
              { icon: <Monitor className="w-8 h-8" />, title: "Live Audience View", desc: "Real-time scoreboards for fans with smooth animations and match status." },
              { icon: <Layout className="w-8 h-8" />, title: "Auto-Scheduling", desc: "Intelligent court assignment based on umpire availability and match priority." }
            ].map((f, i) => (
              <Card key={i} className="border-none shadow-sm hover:shadow-xl transition-all p-8 rounded-3xl bg-white">
                <div className="bg-blue-50 text-blue-600 p-4 rounded-2xl w-fit mb-6">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing / Subscribe CTA */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-4xl mx-auto bg-slate-900 rounded-[3rem] p-12 md:p-20 text-center text-white relative overflow-hidden shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-600/20 to-transparent pointer-events-none" />
          <div className="relative z-10 space-y-8">
            <h2 className="text-4xl md:text-5xl font-black">Ready to go professional?</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              Choose a subscription plan that fits your event scale. From single-day local meets to annual club management.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-8">
              <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-left">
                <h3 className="text-xl font-bold mb-2">Single Event</h3>
                <p className="text-3xl font-black mb-4">$9.99 <span className="text-sm font-normal text-slate-500">/ event</span></p>
                <ul className="space-y-3 text-sm text-slate-400 mb-8">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" /> 24-hour full access</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" /> Unlimited courts</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-blue-500" /> Real-time audience view</li>
                </ul>
                <Button className="w-full bg-white text-slate-900 hover:bg-slate-100 font-bold rounded-xl">Subscribe Now</Button>
              </div>
              <div className="p-8 rounded-3xl bg-blue-600 text-left relative">
                <Badge className="absolute top-4 right-4 bg-white text-blue-600">POPULAR</Badge>
                <h3 className="text-xl font-bold mb-2">Annual Pro</h3>
                <p className="text-3xl font-black mb-4">$199 <span className="text-sm font-normal text-blue-200">/ year</span></p>
                <ul className="space-y-3 text-sm text-blue-100 mb-8">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-white" /> Unlimited tournaments</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-white" /> Custom branding & logos</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-white" /> Priority support</li>
                </ul>
                <Button className="w-full bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-xl">Go Annual</Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-100 text-center">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-blue-600" />
            <span className="font-bold text-slate-900">SmashTrack</span>
          </div>
          <p className="text-slate-400 text-sm">© 2026 SmashTrack. All rights reserved.</p>
          <div className="flex gap-6 text-sm font-medium text-slate-500">
            <a href="#" className="hover:text-blue-600">Privacy</a>
            <a href="#" className="hover:text-blue-600">Terms</a>
            <a href="#" className="hover:text-blue-600">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

const LicenseActivationView = ({ onActivate }: { onActivate: (pin: string) => void }) => {
  const [pin, setPin] = useState('');
  return (
    <div className="max-w-md mx-auto mt-20">
      <Card className="border-none shadow-2xl bg-white">
        <CardHeader className="text-center">
          <div className="mx-auto bg-blue-100 p-4 rounded-2xl w-fit mb-4">
            <Key className="w-8 h-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-bold">License Required</CardTitle>
          <CardDescription>Enter your activation PIN to start organizing tournaments</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input 
            placeholder="Enter Activation PIN" 
            className="text-center text-2xl tracking-widest font-mono uppercase h-14 border-2 focus:border-blue-500" 
            value={pin}
            onChange={(e) => setPin(e.target.value.toUpperCase())}
          />
          <Button 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-lg shadow-blue-100"
            onClick={() => onActivate(pin)}
            disabled={!pin}
          >
            Activate License
          </Button>
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
            <p className="text-xs text-center text-slate-500 leading-relaxed">
              Organizers require a valid license to manage tournaments. 
              Contact the system administrator to obtain an activation PIN.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [view, setView] = useState<'organizer' | 'umpire' | 'audience' | 'login' | 'superadmin' | 'landing'>('landing');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [tempTournament, setTempTournament] = useState<Tournament | null>(null);
  const [pinPrompt, setPinPrompt] = useState<{ t: Tournament, callback: () => void } | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [umpires, setUmpires] = useState<Umpire[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  console.log("App Render - View:", view, "User:", user?.email, "AppUser Role:", appUser?.role);

  const addNotification = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications(prev => [{ id, message, type, timestamp: new Date().toISOString(), read: false }, ...prev].slice(0, 5));
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 10000);
  };

  useEffect(() => {
    console.log("Setting up auth listener...");
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      console.log("Auth state changed:", u?.email || "No user");
      setUser(u);
      if (u) {
        try {
          const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', u.uid), limit(1)));
          
          if (!userSnap.empty) {
            let data = userSnap.docs[0].data() as AppUser;
            console.log("User data found:", data.role);
            
            // Auto-activate new license if current one is missing or expired
            const isNowValid = data.role === 'superadmin' || (data.licenseValidUntil && new Date(data.licenseValidUntil) > new Date());
            if (!isNowValid && data.role === 'organizer') {
              console.log("Checking for new registered license for existing organizer...");
              const userEmail = u.email || data.email;
              if (userEmail) {
                const licenseSnap = await getDocs(query(
                  collection(db, 'licenses'), 
                  where('organizerEmail', '==', userEmail),
                  where('status', '==', 'pending'),
                  limit(1)
                ));
                
                if (!licenseSnap.empty) {
                  const licenseDoc = licenseSnap.docs[0];
                  const licenseData = licenseDoc.data() as License;
                  console.log("New license found, auto-activating...");
                  
                  await updateDoc(doc(db, 'users', u.uid), {
                    licenseId: licenseDoc.id,
                    licenseValidUntil: licenseData.validUntil
                  });
                  await updateDoc(doc(db, 'licenses', licenseDoc.id), {
                    status: 'active',
                    usedByUid: u.uid
                  });
                  
                  data = { ...data, licenseId: licenseDoc.id, licenseValidUntil: licenseData.validUntil };
                  addNotification("Your new license has been activated!", "success");
                }
              }
            }
            setAppUser(data);
            // Only auto-redirect if they are stuck on login or if they are superadmin
            if (data.role === 'superadmin') setView('superadmin');
            else {
              setView(prev => {
                if (prev === 'login') {
                  console.log("Redirecting from login to organizer");
                  return 'organizer';
                }
                return prev;
              });
            }
          } else {
            console.log("New user detected, verifying license for email:", u.email);
            const isDefaultAdmin = u.email === 'ammarthaqif.ar@gmail.com';
            
            if (isDefaultAdmin) {
              console.log("Default admin detected, creating superadmin profile...");
              const newUser: AppUser = {
                uid: u.uid,
                email: u.email || '',
                role: 'superadmin'
              };
              await setDoc(doc(db, 'users', u.uid), newUser);
              setAppUser(newUser);
              setView('superadmin');
              addNotification("Welcome, System Administrator.", "success");
            } else if (u.email) {
              // Check for license matching the email
              const licenseSnap = await getDocs(query(
                collection(db, 'licenses'), 
                where('organizerEmail', '==', u.email),
                limit(1)
              ));

              if (!licenseSnap.empty) {
                const licenseDoc = licenseSnap.docs[0];
                const licenseData = licenseDoc.data() as License;
                
                console.log("License found for user, activating...", licenseDoc.id);
                
                const newUser: AppUser = {
                  uid: u.uid,
                  email: u.email || '',
                  role: 'organizer',
                  licenseId: licenseDoc.id,
                  licenseValidUntil: licenseData.validUntil
                };
                
                await setDoc(doc(db, 'users', u.uid), newUser);
                // Update license status to active
                await updateDoc(doc(db, 'licenses', licenseDoc.id), {
                  status: 'active',
                  usedByUid: u.uid
                });
                
                setAppUser(newUser);
                setView('organizer');
                addNotification("License activated! Welcome to SmashTrack.", "success");
              } else {
                console.log("No license found for email:", u.email);
                addNotification("Access Denied: No registered license found for this email.", "warning");
                // Sign out the user as they are not authorized to be an organizer
                await auth.signOut();
                setView('login'); // Stay on login view so they can see the notification and try again
              }
            }
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          handleFirestoreError(error, OperationType.GET, 'users');
        }
      } else {
        setAppUser(null);
        // Only redirect to landing if they are in a view that REQUIRES auth
        setView(prev => {
          if (prev === 'organizer' || prev === 'superadmin') {
            console.log("User logged out from restricted view, redirecting to login");
            return 'login'; // Go to login so they can see any access denied messages
          }
          return prev;
        });
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || view !== 'organizer') return;
    const q = query(collection(db, 'tournaments'), where('organizerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTournaments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tournament)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'tournaments');
    });
    return () => unsubscribe();
  }, [user, view]);

  const selectedTournament = tournaments.find(t => t.id === selectedTournamentId) || tempTournament;

  useEffect(() => {
    if (!selectedTournamentId) return;
    const qMatches = query(collection(db, `tournaments/${selectedTournamentId}/matches`));
    const unsubMatches = onSnapshot(qMatches, (snapshot) => {
      setMatches(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `tournaments/${selectedTournament.id}/matches`);
    });

    const qPlayers = query(collection(db, `tournaments/${selectedTournamentId}/players`));
    const unsubPlayers = onSnapshot(qPlayers, (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Player)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `tournaments/${selectedTournamentId}/players`);
    });

    const qUmpires = query(collection(db, `tournaments/${selectedTournamentId}/umpires`));
    const unsubUmpires = onSnapshot(qUmpires, (snapshot) => {
      setUmpires(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Umpire)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `tournaments/${selectedTournamentId}/umpires`);
    });

    return () => {
      unsubMatches();
      unsubPlayers();
      unsubUmpires();
    };
  }, [selectedTournamentId]);

  const handleLogin = async () => {
    console.log("handleLogin triggered");
    setLoginLoading(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      console.log("Attempting signInWithPopup...");
      const result = await signInWithPopup(auth, provider);
      console.log("signInWithPopup successful:", result.user.email);
      addNotification("Login successful!", "success");
    } catch (error: any) {
      console.error("Login failed details:", error);
      addNotification(`Login failed: ${error.message || "Unknown error"}`, "warning");
      alert(`Login failed: ${error.message || "Unknown error"}. Please ensure popups are allowed and you are not in an incognito window that blocks third-party cookies.`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLicenseLogin = async (email: string, pin: string) => {
    setLoginLoading(true);
    try {
      console.log("Attempting license login for:", email);
      // 1. Sign in anonymously to get a session
      const authResult = await signInAnonymously(auth);
      const u = authResult.user;
      
      // 2. Query for the license
      const q = query(
        collection(db, 'licenses'), 
        where('organizerEmail', '==', email),
        where('accessPin', '==', pin),
        limit(1)
      );
      const snap = await getDocs(q);
      
      if (!snap.empty) {
        const licenseDoc = snap.docs[0];
        const licenseData = licenseDoc.data() as License;
        
        // 3. Create/Update user profile
        const newUser: AppUser = {
          uid: u.uid,
          email: email,
          role: 'organizer',
          licenseId: licenseDoc.id,
          licenseValidUntil: licenseData.validUntil
        };
        
        await setDoc(doc(db, 'users', u.uid), newUser);
        
        // 4. Update license status if it was pending or usedByUid was different
        if (licenseData.status === 'pending' || licenseData.usedByUid !== u.uid) {
          await updateDoc(doc(db, 'licenses', licenseDoc.id), {
            status: 'active',
            usedByUid: u.uid
          });
        }
        
        setAppUser(newUser);
        setView('organizer');
        addNotification("License verified! Welcome back.", "success");
      } else {
        await auth.signOut();
        addNotification("Invalid Email or PIN. Please check your credentials.", "warning");
        alert("Invalid Email or PIN. Please ensure you are using the registered email and the correct access PIN.");
      }
    } catch (error: any) {
      console.error("License login failed:", error);
      addNotification(`Login failed: ${error.message}`, "warning");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleJoinByPin = async (pin: string) => {
    console.log("handleJoinByPin called with PIN:", pin);
    // Check umpire PIN
    const qUmpire = query(collection(db, 'tournaments'), where('umpirePin', '==', pin), limit(1));
    const snapUmpire = await getDocs(qUmpire);
      if (!snapUmpire.empty) {
        const t = { id: snapUmpire.docs[0].id, ...snapUmpire.docs[0].data() } as Tournament;
        console.log("Umpire PIN matched tournament:", t.name);
        setSelectedTournamentId(t.id!);
        setTempTournament(t);
        setView('umpire');
        return;
      }
  
      // Check audience PIN
      const qAudience = query(collection(db, 'tournaments'), where('audiencePin', '==', pin), limit(1));
      const snapAudience = await getDocs(qAudience);
      if (!snapAudience.empty) {
        const t = { id: snapAudience.docs[0].id, ...snapAudience.docs[0].data() } as Tournament;
        console.log("Audience PIN matched tournament:", t.name);
        setSelectedTournamentId(t.id!);
        setTempTournament(t);
        setView('audience');
        return;
      }
  
      // Fallback for legacy PIN
      const qLegacy = query(collection(db, 'tournaments'), where('pin', '==', pin), limit(1));
      const snapLegacy = await getDocs(qLegacy);
      if (!snapLegacy.empty) {
        const t = { id: snapLegacy.docs[0].id, ...snapLegacy.docs[0].data() } as Tournament;
        console.log("Legacy PIN matched tournament:", t.name);
        setSelectedTournamentId(t.id!);
        setTempTournament(t);
        return;
      }

    console.warn("Invalid PIN entered:", pin);
    alert("Invalid PIN. Please check the PIN and try again.");
  };

  const selectTournamentAsOrganizer = (t: Tournament) => {
    if (user && t.organizerId === user.uid) {
      setSelectedTournamentId(t.id!);
      setView('organizer');
      return;
    }

    setPinPrompt({
      t,
      callback: () => {
        setSelectedTournamentId(t.id!);
        setView('organizer');
        setPinPrompt(null);
      }
    });
  };

  const createTournament = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const newTournament: Omit<Tournament, 'id'> = {
      name: formData.get('name') as string,
      organizerId: user.uid,
      date: formData.get('date') as string,
      venue: formData.get('venue') as string,
      numCourts: Number(formData.get('courts')),
      pin: Math.random().toString(36).substring(2, 8).toUpperCase(),
      umpirePin: Math.random().toString(36).substring(2, 8).toUpperCase(),
      audiencePin: Math.random().toString(36).substring(2, 8).toUpperCase(),
      createdAt: new Date().toISOString(),
    };
    const docRef = await addDoc(collection(db, 'tournaments'), newTournament);
    form.reset();
    const createdTournament = { id: docRef.id, ...newTournament };
    setTempTournament(createdTournament);
    setSelectedTournamentId(docRef.id);
    addNotification("Tournament created successfully!", "success");
  };

  const createMatch = async (tournamentId: string, player1Id?: string, player2Id?: string, umpireId?: string) => {
    const p1 = players.find(p => p.id === player1Id);
    const p2 = players.find(p => p.id === player2Id);
    const ump = umpires.find(u => u.id === umpireId);

    const newMatch: Omit<Match, 'id'> = {
      tournamentId,
      courtNumber: 1,
      player1: p1?.name || "Player A",
      player2: p2?.name || "Player B",
      player1Id: player1Id || "",
      player2Id: player2Id || "",
      score1: 0,
      score2: 0,
      status: 'scheduled',
      isDoubles: false,
      server: 'p1',
      sets: [],
      currentSet: 1,
      umpireId: umpireId || "",
      umpireName: ump?.name || ""
    };
    await addDoc(collection(db, `tournaments/${tournamentId}/matches`), newMatch);
  };

  const registerPlayer = async (tournamentId: string, name: string, category: 'singles' | 'doubles' | 'mixed' = 'singles') => {
    const newPlayer: Omit<Player, 'id'> = {
      name,
      tournamentId,
      category,
      stats: { matchesPlayed: 0, wins: 0, losses: 0, totalPoints: 0 }
    };
    await addDoc(collection(db, `tournaments/${tournamentId}/players`), newPlayer);
  };

  const importPlayers = async (tournamentId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(worksheet) as any[];

      for (const row of json) {
        const name = row.Name || row.name || row.PLAYER || row.player;
        const category = (row.Category || row.category || 'singles').toLowerCase();
        const validCategory = ['singles', 'doubles', 'mixed'].includes(category) ? category : 'singles';
        
        if (name) {
          await registerPlayer(tournamentId, name, validCategory as any);
        }
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const registerUmpire = async (tournamentId: string, name: string) => {
    const newUmpire: Omit<Umpire, 'id'> = {
      name,
      tournamentId,
      isAvailable: true,
      preferredCourts: []
    };
    await addDoc(collection(db, `tournaments/${tournamentId}/umpires`), newUmpire);
    addNotification(`Umpire ${name} registered successfully`, 'success');
  };

  const toggleUmpireAvailability = async (tournamentId: string, umpireId: string, currentStatus: boolean) => {
    const uRef = doc(db, `tournaments/${tournamentId}/umpires/${umpireId}`);
    await updateDoc(uRef, { isAvailable: !currentStatus });
  };

  const renameCourt = async (tournamentId: string, courtNumber: number, name: string) => {
    const tRef = doc(db, 'tournaments', tournamentId);
    await updateDoc(tRef, {
      [`courtNames.${courtNumber}`]: name
    });
  };

  const autoSchedule = async (tournamentId: string) => {
    if (!selectedTournament) return;
    
    const matchesRef = collection(db, `tournaments/${tournamentId}/matches`);
    const snapshot = await getDocs(matchesRef);
    const currentMatches = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Match));

    const scheduledMatches = currentMatches.filter(m => m.status === 'scheduled');
    const ongoingMatches = currentMatches.filter(m => m.status === 'ongoing');
    const occupiedCourts = new Set(ongoingMatches.map(m => m.courtNumber));
    const assignedUmpires = new Set(ongoingMatches.map(m => m.umpireId).filter(Boolean));

    const availableUmpires = umpires.filter(u => u.isAvailable && !assignedUmpires.has(u.id));

    console.log('Auto-scheduling matches:', scheduledMatches.length);
    console.log('Available Umpires:', availableUmpires.length);

    for (const match of scheduledMatches) {
      let availableCourt = -1;
      for (let i = 1; i <= selectedTournament.numCourts; i++) {
        if (!occupiedCourts.has(i)) {
          availableCourt = i;
          break;
        }
      }

      if (availableCourt !== -1) {
        // Find a preferred umpire for this court if possible
        const preferredUmpire = availableUmpires.find(u => u.preferredCourts?.includes(availableCourt)) || availableUmpires[0];
        
        console.log(`Assigning ${match.player1} vs ${match.player2} to Court ${availableCourt}`);
        const matchRef = doc(db, `tournaments/${tournamentId}/matches/${match.id}`);
        const updateData: any = {
          courtNumber: availableCourt,
          status: 'ongoing',
          lastUpdated: new Date().toISOString()
        };

        if (preferredUmpire) {
          updateData.umpireId = preferredUmpire.id;
          updateData.umpireName = preferredUmpire.name;
          // Remove from available list for this run
          availableUmpires.splice(availableUmpires.indexOf(preferredUmpire), 1);
        }

        await updateDoc(matchRef, updateData);
        occupiedCourts.add(availableCourt);
        addNotification(`Match ${match.player1} vs ${match.player2} started on Court ${availableCourt}`, 'info');
      } else {
        break;
      }
    }
  };

  const activateLicense = async (pin: string) => {
    if (!user || !appUser) return;
    console.log("Activating license with PIN:", pin, "for email:", user.email);
    const q = query(
      collection(db, 'licenses'), 
      where('accessPin', '==', pin), 
      where('organizerEmail', '==', user.email),
      where('status', '==', 'pending'), 
      limit(1)
    );
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      const license = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as License;
      console.log("Valid license found, activating...");
      
      await updateDoc(doc(db, 'licenses', license.id!), {
        status: 'active',
        usedByUid: user.uid
      });

      const updatedUser: AppUser = {
        ...appUser,
        role: 'organizer',
        licenseId: license.id,
        licenseValidUntil: license.validUntil
      };
      await updateDoc(doc(db, 'users', user.uid), {
        role: 'organizer',
        licenseId: license.id,
        licenseValidUntil: license.validUntil
      });
      
      setAppUser(updatedUser);
      addNotification("License activated! You are now an organizer.", "success");
    } else {
      console.log("License activation failed: PIN/Email mismatch or already used");
      alert("Invalid PIN or this license was not registered for your email address.");
    }
  };

  const isLicenseValid = appUser?.role === 'superadmin' || (appUser?.role === 'organizer' && appUser.licenseValidUntil && new Date(appUser.licenseValidUntil) > new Date());

  const handleStart = () => {
    console.log("handleStart called. User:", user?.email, "AppUser Role:", appUser?.role, "License Valid:", isLicenseValid);
    if (user && appUser && isLicenseValid) {
      console.log("User is logged in and valid, navigating to dashboard");
      setView(appUser.role === 'superadmin' ? 'superadmin' : 'organizer');
    } else {
      console.log("User is not logged in or invalid, navigating to login");
      setView('login');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-screen font-mono text-slate-400">Loading SmashTrack...</div>;

  const renderView = () => {
    if (view === 'landing') {
      return <LandingView onStart={handleStart} />;
    }

    if (view === 'superadmin') {
      return <SuperadminDashboard />;
    }

    if (view === 'login' && !user) {
      return (
        <LoginView 
          onLogin={handleLogin} 
          loginLoading={loginLoading}
          onJoin={handleJoinByPin} 
          tempTournament={tempTournament}
          onSelectRole={(role) => {
            setSelectedTournamentId(tempTournament?.id || null);
            setView(role);
            setTempTournament(null);
          }}
          onCancelJoin={() => setTempTournament(null)}
          onLicenseLogin={handleLicenseLogin}
        />
      );
    }

    if (view === 'audience' && selectedTournament) {
      return <AudienceView tournamentId={selectedTournament.id!} onBack={() => { setView('login'); setSelectedTournamentId(null); }} />;
    }

    if (activeMatchId && selectedTournament) {
      return <UmpireScoring matchId={activeMatchId} tournamentId={selectedTournament.id!} onExit={() => setActiveMatchId(null)} />;
    }

    return (
      <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setSelectedTournamentId(null); setTempTournament(null); }}>
              <div className="bg-blue-600 p-1.5 rounded-lg">
                <Trophy className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-xl tracking-tight">SmashTrack</span>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-3">
                  <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-slate-200" />
                  <Button variant="ghost" size="sm" onClick={() => auth.signOut()}>
                    <LogOut className="w-4 h-4 mr-2" /> Sign Out
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setView('login')}>Login</Button>
              )}
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {pinPrompt && (
            <Dialog open={!!pinPrompt} onOpenChange={() => setPinPrompt(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Authentication Required</DialogTitle>
                  <CardDescription>Enter the tournament PIN to access the organizer dashboard for "{pinPrompt.t.name}"</CardDescription>
                </DialogHeader>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const pin = new FormData(e.currentTarget).get('pin') as string;
                  if (pin === pinPrompt.t.pin) {
                    pinPrompt.callback();
                  } else {
                    alert("Incorrect PIN");
                  }
                }} className="space-y-4 pt-4">
                  <Input name="pin" placeholder="Enter PIN" className="text-center text-2xl tracking-widest font-mono uppercase" required />
                  <Button type="submit" className="w-full">Authenticate</Button>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {!isLicenseValid && view === 'organizer' ? (
            <LicenseActivationView onActivate={activateLicense} />
          ) : !selectedTournament ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900">Your Tournaments</h1>
                  <p className="text-slate-500">Manage and track your badminton events</p>
                </div>
                <Button onClick={() => setView('organizer')} className="bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100">
                  <Plus className="w-4 h-4 mr-2" /> New Tournament
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tournaments.map((t) => (
                  <Card key={t.id} className="group hover:shadow-xl transition-all border-slate-200 overflow-hidden cursor-pointer" onClick={() => selectTournamentAsOrganizer(t)}>
                    <div className="h-2 bg-blue-600" />
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-xl group-hover:text-blue-600 transition-colors">{t.name}</CardTitle>
                        <Badge variant="secondary" className="font-mono">{t.pin}</Badge>
                      </div>
                      <CardDescription>{t.venue} • {t.date}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <div className="flex items-center gap-1"><Monitor className="w-4 h-4" /> {t.numCourts} Courts</div>
                        <div className="flex items-center gap-1"><Users className="w-4 h-4" /> {matches.length} Matches</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                
                <Card className="border-dashed border-2 border-slate-200 flex flex-col items-center justify-center p-8 text-slate-400 hover:border-blue-400 hover:text-blue-400 transition-all cursor-pointer bg-transparent">
                  <Plus className="w-12 h-12 mb-2" />
                  <p className="font-medium">Create New Tournament</p>
                </Card>
              </div>

              {/* Create Tournament Form (Modal-like) */}
              <Card className="max-w-2xl mx-auto border-slate-200">
                <CardHeader>
                  <CardTitle>Quick Setup</CardTitle>
                  <CardDescription>Fill in the details to launch your tournament</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createTournament} className="grid grid-cols-2 gap-4">
                    <div className="col-span-2 space-y-2">
                      <label className="text-sm font-medium">Tournament Name</label>
                      <Input name="name" placeholder="e.g. Summer Open 2026" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date</label>
                      <Input name="date" type="date" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Venue</label>
                      <Input name="venue" placeholder="City Sports Center" required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Number of Courts</label>
                      <Input name="courts" type="number" min="1" defaultValue="4" required />
                    </div>
                    <div className="col-span-2 pt-4">
                      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">Create Tournament</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          ) : (
            <TournamentDashboard 
              tournament={selectedTournament} 
              matches={matches} 
              players={players}
              umpires={umpires}
              onBack={() => { setSelectedTournamentId(null); setTempTournament(null); }} 
              onUmpireMatch={(id) => setActiveMatchId(id)}
              onCreateMatch={createMatch}
              onRegisterPlayer={registerPlayer}
              onImportPlayers={importPlayers}
              onRegisterUmpire={registerUmpire}
              onToggleUmpireAvailability={toggleUmpireAvailability}
              onRenameCourt={renameCourt}
              onAutoSchedule={() => autoSchedule(selectedTournament.id!)}
              addNotification={addNotification}
            />
          )}
        </main>
      </div>
    );
  };

  return (
    <ErrorBoundary>
      {/* Global Notifications Overlay */}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, x: 50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={cn(
                "p-4 rounded-xl shadow-lg border pointer-events-auto min-w-[300px] max-w-md flex items-start gap-3",
                n.type === 'success' ? "bg-green-50 border-green-100 text-green-800" :
                n.type === 'warning' ? "bg-yellow-50 border-yellow-100 text-yellow-800" :
                "bg-white border-slate-200 text-slate-800"
              )}
            >
              <div className="flex-1">
                <p className="text-sm font-medium">{n.message}</p>
                <p className="text-[10px] opacity-50 mt-1">{new Date(n.timestamp).toLocaleTimeString()}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={view + (selectedTournament?.id || '') + (activeMatchId || '')}
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          transition={{ duration: 0.2 }}
        >
          {renderView()}
        </motion.div>
      </AnimatePresence>
    </ErrorBoundary>
  );
}

function TournamentDashboard({ 
  tournament, 
  matches, 
  players,
  umpires,
  onBack, 
  onUmpireMatch, 
  onCreateMatch,
  onRegisterPlayer,
  onImportPlayers,
  onRegisterUmpire,
  onToggleUmpireAvailability,
  onRenameCourt,
  onAutoSchedule,
  addNotification
}: { 
  tournament: Tournament, 
  matches: Match[], 
  players: Player[],
  umpires: Umpire[],
  onBack: () => void,
  onUmpireMatch: (id: string) => void,
  onCreateMatch: (tId: string, p1Id?: string, p2Id?: string, uId?: string) => void,
  onRegisterPlayer: (tId: string, name: string, category: 'singles' | 'doubles' | 'mixed') => void,
  onImportPlayers: (tId: string, file: File) => void,
  onRegisterUmpire: (tId: string, name: string) => void,
  onToggleUmpireAvailability: (tId: string, uId: string, current: boolean) => void,
  onRenameCourt: (tId: string, courtNum: number, name: string) => void,
  onAutoSchedule: () => void,
  addNotification: (message: string, type?: 'info' | 'success' | 'warning') => void
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [playerCategoryTab, setPlayerCategoryTab] = useState('singles');
  const [playerSearch, setPlayerSearch] = useState('');
  const [editingCourt, setEditingCourt] = useState<number | null>(null);
  const [expandedMatchId, setExpandedMatchId] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full hover:bg-slate-100">
            <ChevronDown className="w-5 h-5 rotate-90" />
          </Button>
          {tournament.logoUrl && (
            <img 
              src={tournament.logoUrl} 
              alt="Logo" 
              className="w-12 h-12 rounded-lg object-cover border border-slate-100"
              referrerPolicy="no-referrer"
            />
          )}
          <div>
            <h2 className="text-2xl font-bold">{tournament.name}</h2>
            <p className="text-slate-500 text-sm">{tournament.venue} • {tournament.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-6 mr-4">
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Umpire PIN</p>
              <p className="text-lg font-mono font-bold text-blue-600">{tournament.umpirePin || tournament.pin}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Audience PIN</p>
              <p className="text-lg font-mono font-bold text-green-600">{tournament.audiencePin || tournament.pin}</p>
            </div>
          </div>
          <Dialog>
            <DialogTrigger render={<Button variant="outline" className="gap-2 rounded-xl border-slate-200 hover:bg-slate-50" />}>
              <Settings className="w-4 h-4" /> Edit Details
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Tournament Settings</DialogTitle>
                <CardDescription>Update tournament details and configuration</CardDescription>
              </DialogHeader>
              <form 
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  const tRef = doc(db, 'tournaments', tournament.id!);
                  await updateDoc(tRef, {
                    name: fd.get('name') as string,
                    date: fd.get('date') as string,
                    venue: fd.get('venue') as string,
                    numCourts: Number(fd.get('courts')),
                    logoUrl: fd.get('logoUrl') as string
                  });
                  addNotification("Settings updated successfully!", "success");
                }} 
                className="space-y-4 pt-4"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tournament Name</label>
                  <Input name="name" defaultValue={tournament.name} required />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Tournament Logo URL</label>
                  <Input name="logoUrl" defaultValue={tournament.logoUrl} placeholder="https://example.com/logo.png" />
                  <p className="text-[10px] text-slate-400 italic">Provide a URL for the tournament logo or banner</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Date</label>
                    <Input name="date" type="date" defaultValue={tournament.date} required />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Number of Courts</label>
                    <Input name="courts" type="number" min="1" defaultValue={tournament.numCourts} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Venue</label>
                  <Input name="venue" defaultValue={tournament.venue} required />
                </div>
                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700">Save Changes</Button>
                
                <div className="pt-6 border-t border-slate-100 mt-6">
                  <Button 
                    type="button" 
                    variant="ghost" 
                    className="w-full text-red-500 hover:bg-red-50 hover:text-red-600"
                    onClick={async () => {
                      if (window.confirm("Are you sure you want to delete this tournament? This action cannot be undone.")) {
                        await deleteDoc(doc(db, 'tournaments', tournament.id!));
                        addNotification("Tournament deleted", "info");
                        onBack();
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Delete Tournament
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog>
            <DialogTrigger render={<Button variant="outline" className="gap-2" />}>
              <QrCode className="w-4 h-4" /> Share QR
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl flex flex-col items-center text-center">
              <DialogHeader>
                <DialogTitle>Tournament Access</DialogTitle>
                <CardDescription>Share these PINs or QR codes with umpires and audience members</CardDescription>
              </DialogHeader>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mt-6">
                {/* Umpire Access */}
                <div className="flex flex-col items-center p-6 rounded-2xl bg-blue-50 border border-blue-100">
                  <div className="bg-blue-600 p-2 rounded-lg mb-4">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-blue-900 mb-2">Umpire Access</h3>
                  <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                    <QRCodeSVG value={tournament.umpirePin || tournament.pin} size={150} level="H" includeMargin />
                  </div>
                  <p className="text-xs text-slate-500 mb-1 uppercase font-bold tracking-wider">Umpire PIN</p>
                  <p className="text-2xl font-mono font-black text-blue-600 tracking-widest">{tournament.umpirePin || tournament.pin}</p>
                </div>

                {/* Audience Access */}
                <div className="flex flex-col items-center p-6 rounded-2xl bg-green-50 border border-green-100">
                  <div className="bg-green-600 p-2 rounded-lg mb-4">
                    <Monitor className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold text-green-900 mb-2">Audience Access</h3>
                  <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                    <QRCodeSVG value={tournament.audiencePin || tournament.pin} size={150} level="H" includeMargin />
                  </div>
                  <p className="text-xs text-slate-500 mb-1 uppercase font-bold tracking-wider">Audience PIN</p>
                  <p className="text-2xl font-mono font-black text-green-600 tracking-widest">{tournament.audiencePin || tournament.pin}</p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-white border border-slate-200 p-1 rounded-xl h-12">
          <TabsTrigger value="overview" className="rounded-lg px-6">Overview</TabsTrigger>
          <TabsTrigger value="matches" className="rounded-lg px-6">Matches</TabsTrigger>
          <TabsTrigger value="umpires" className="rounded-lg px-6">Umpires</TabsTrigger>
          <TabsTrigger value="players" className="rounded-lg px-6">Players</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-none shadow-sm bg-blue-600 text-white">
              <CardHeader>
                <CardTitle className="text-lg opacity-80">Ongoing Matches</CardTitle>
                <div className="text-4xl font-bold">{matches.filter(m => m.status === 'ongoing').length}</div>
              </CardHeader>
            </Card>
            <Card className="border-none shadow-sm bg-slate-900 text-white">
              <CardHeader>
                <CardTitle className="text-lg opacity-80">Total Matches</CardTitle>
                <div className="text-4xl font-bold">{matches.length}</div>
              </CardHeader>
            </Card>
            <Card className="border-none shadow-sm bg-white">
              <CardHeader>
                <CardTitle className="text-lg text-slate-500">Courts Available</CardTitle>
                <div className="text-4xl font-bold text-slate-900">{tournament.numCourts}</div>
              </CardHeader>
            </Card>
          </div>
          
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Live Court Status</h3>
              <Button size="sm" variant="outline" onClick={onAutoSchedule}>
                <Play className="w-4 h-4 mr-2" /> Auto-Schedule
              </Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Array.from({ length: tournament.numCourts }).map((_, i) => {
                const courtNum = i + 1;
                const match = matches.find(m => m.courtNumber === courtNum && m.status === 'ongoing');
                const courtName = tournament.courtNames?.[courtNum] || `Court ${courtNum}`;
                
                return (
                  <Card key={i} className={cn("border-2 transition-all", match ? "border-blue-500 bg-blue-50/30" : "border-slate-100 bg-white")}>
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          {editingCourt === courtNum ? (
                            <Input 
                              className="h-6 text-xs w-24" 
                              defaultValue={courtName}
                              autoFocus
                              onBlur={(e) => {
                                onRenameCourt(tournament.id!, courtNum, e.target.value);
                                setEditingCourt(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  onRenameCourt(tournament.id!, courtNum, e.currentTarget.value);
                                  setEditingCourt(null);
                                }
                              }}
                            />
                          ) : (
                            <span 
                              className="font-bold text-slate-400 cursor-pointer hover:text-blue-500"
                              onClick={() => setEditingCourt(courtNum)}
                            >
                              {courtName}
                            </span>
                          )}
                        </div>
                        {match ? <Badge className="bg-blue-500">Live</Badge> : <Badge variant="outline">Empty</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      {match ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm font-bold">
                            <span>{match.player1}</span>
                            <span>{match.score1}</span>
                          </div>
                          <div className="flex justify-between text-sm font-bold">
                            <span>{match.player2}</span>
                            <span>{match.score2}</span>
                          </div>
                          <Button size="sm" variant="outline" className="w-full mt-2 text-xs" onClick={() => onUmpireMatch(match.id!)}>Umpire</Button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No active match</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="matches" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Match Schedule</CardTitle>
                <CardDescription>Assign courts and umpires to matches</CardDescription>
              </div>
              <Dialog>
                <DialogTrigger render={<Button size="sm" className="bg-slate-900" />}>
                  <Plus className="w-4 h-4 mr-2" /> Add Match
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Match</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    onCreateMatch(
                      tournament.id!,
                      fd.get('p1') as string,
                      fd.get('p2') as string,
                      fd.get('umpire') as string
                    );
                  }} className="space-y-4 pt-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Player 1</label>
                      <select name="p1" className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm" required>
                        <option value="">Select Player</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Player 2</label>
                      <select name="p2" className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm" required>
                        <option value="">Select Player</option>
                        {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Umpire (Optional)</label>
                      <select name="umpire" className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm">
                        <option value="">Select Umpire</option>
                        {umpires.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </div>
                    <Button type="submit" className="w-full">Create Match</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Court</TableHead>
                    <TableHead>Players</TableHead>
                    <TableHead>Umpire</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches.map((m) => (
                    <React.Fragment key={m.id}>
                      <TableRow 
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setExpandedMatchId(expandedMatchId === m.id ? null : m.id!)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {expandedMatchId === m.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            {tournament.courtNames?.[m.courtNumber] || `Court ${m.courtNumber}`}
                          </div>
                        </TableCell>
                        <TableCell>{m.player1} vs {m.player2}</TableCell>
                        <TableCell className="text-slate-500 text-xs">{m.umpireName || 'None'}</TableCell>
                        <TableCell>
                          <Badge variant={m.status === 'ongoing' ? 'default' : m.status === 'completed' ? 'secondary' : 'outline'}>
                            {m.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono font-bold">{m.score1} - {m.score2}</TableCell>
                        <TableCell className="text-right flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          {m.status === 'ongoing' ? (
                            <Button variant="default" size="sm" className="bg-blue-600 hover:bg-blue-700 shadow-sm" onClick={() => onUmpireMatch(m.id!)}>
                              <Play className="w-3 h-3 mr-1 fill-current" /> Umpire Now
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => onUmpireMatch(m.id!)}>Umpire</Button>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => deleteDoc(doc(db, `tournaments/${tournament.id}/matches/${m.id}`))}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      <AnimatePresence>
                        {expandedMatchId === m.id && (
                          <TableRow className="bg-slate-50/50 border-b border-slate-100">
                            <TableCell colSpan={6} className="p-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                                  <div className="space-y-1">
                                    <p className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">Current Status</p>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold">Set {m.currentSet || 1}</span>
                                      <Badge variant="outline" className="text-[10px]">
                                        Server: {m.server === 'p1' ? m.player1 : m.player2}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className="md:col-span-2 space-y-2">
                                    <p className="text-slate-500 font-medium uppercase text-[10px] tracking-wider">Set History</p>
                                    <div className="flex gap-4">
                                      {m.sets && m.sets.length > 0 ? (
                                        m.sets.map((set, idx) => (
                                          <div key={idx} className="bg-white border border-slate-200 rounded-lg p-2 min-w-[80px] text-center shadow-sm">
                                            <p className="text-[10px] text-slate-400 mb-1 font-bold">SET {idx + 1}</p>
                                            <p className="font-mono font-bold text-lg">{set.s1} - {set.s2}</p>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="text-slate-400 italic text-xs">No sets completed yet</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            </TableCell>
                          </TableRow>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="umpires" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Registered Umpires</CardTitle>
                <CardDescription>Manage officials for this tournament</CardDescription>
              </div>
              <Dialog>
                <DialogTrigger render={<Button size="sm" className="bg-slate-900" />}>
                  <Plus className="w-4 h-4 mr-2" /> Register Umpire
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Register Umpire</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const name = new FormData(e.currentTarget).get('name') as string;
                    onRegisterUmpire(tournament.id!, name);
                    e.currentTarget.reset();
                  }} className="space-y-4 pt-4">
                    <Input name="name" placeholder="Full Name" required />
                    <Button type="submit" className="w-full">Register</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {umpires.map(u => (
                  <Card key={u.id} className={cn("p-4 flex flex-col gap-4 transition-all", !u.isAvailable && "opacity-60 bg-slate-50")}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", u.isAvailable ? "bg-green-100" : "bg-slate-200")}>
                          <Users className={cn("w-4 h-4", u.isAvailable ? "text-green-600" : "text-slate-400")} />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{u.name}</p>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                            {u.isAvailable ? 'Available' : 'Unavailable'}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon-sm" onClick={() => deleteDoc(doc(db, `tournaments/${tournament.id}/umpires/${u.id}`))}>
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </Button>
                    </div>
                    <Button 
                      variant={u.isAvailable ? "outline" : "default"} 
                      size="sm" 
                      className="w-full text-xs h-8"
                      onClick={() => onToggleUmpireAvailability(tournament.id!, u.id!, u.isAvailable)}
                    >
                      {u.isAvailable ? 'Mark Unavailable' : 'Mark Available'}
                    </Button>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="players" className="mt-6">
          <Card>
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle>Registered Players</CardTitle>
                <CardDescription>View player statistics and performance by category</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onImportPlayers(tournament.id!, file);
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <FileUp className="w-4 h-4 mr-2" /> Import Excel
                </Button>
                <Dialog>
                  <DialogTrigger render={<Button size="sm" className="bg-slate-900" />}>
                    <Plus className="w-4 h-4 mr-2" /> Register Player
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Register Player</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const fd = new FormData(e.currentTarget);
                      onRegisterPlayer(
                        tournament.id!, 
                        fd.get('name') as string, 
                        fd.get('category') as any
                      );
                      e.currentTarget.reset();
                    }} className="space-y-4 pt-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Player Name</label>
                        <Input name="name" placeholder="Full Name" required />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Category</label>
                        <select name="category" className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm" required>
                          <option value="singles">Singles</option>
                          <option value="doubles">Doubles</option>
                          <option value="mixed">Mixed</option>
                        </select>
                      </div>
                      <Button type="submit" className="w-full">Register</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input 
                  placeholder="Search players by name..." 
                  className="pl-10"
                  value={playerSearch}
                  onChange={(e) => setPlayerSearch(e.target.value)}
                />
              </div>
              <Tabs defaultValue="singles" className="w-full" onValueChange={setPlayerCategoryTab}>
                <TabsList className="bg-slate-100 mb-4">
                  <TabsTrigger value="singles">Singles</TabsTrigger>
                  <TabsTrigger value="doubles">Doubles</TabsTrigger>
                  <TabsTrigger value="mixed">Mixed</TabsTrigger>
                </TabsList>
                
                {['singles', 'doubles', 'mixed'].map((cat) => (
                  <TabsContent key={cat} value={cat}>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Player Name</TableHead>
                          <TableHead className="text-center">Played</TableHead>
                          <TableHead className="text-center">Wins</TableHead>
                          <TableHead className="text-center">Losses</TableHead>
                          <TableHead className="text-center">Win Rate</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {players
                          .filter(p => (p.category === cat || (!p.category && cat === 'singles')))
                          .filter(p => p.name.toLowerCase().includes(playerSearch.toLowerCase()))
                          .map(p => {
                          const playerMatches = matches.filter(m => m.status === 'completed' && (m.player1Id === p.id || m.player2Id === p.id));
                          const wins = playerMatches.filter(m => {
                            if (m.player1Id === p.id) return m.score1 > m.score2;
                            return m.score2 > m.score1;
                          }).length;
                          const losses = playerMatches.length - wins;
                          const winRate = playerMatches.length > 0 ? Math.round((wins / playerMatches.length) * 100) : 0;

                          return (
                            <TableRow key={p.id}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-center">{playerMatches.length}</TableCell>
                              <TableCell className="text-center text-green-600 font-bold">{wins}</TableCell>
                              <TableCell className="text-center text-red-600 font-bold">{losses}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className="bg-blue-50 text-blue-700">{winRate}%</Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button variant="ghost" size="sm" onClick={() => deleteDoc(doc(db, `tournaments/${tournament.id}/players/${p.id}`))}>
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

