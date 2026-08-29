/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { 
  Lock, Unlock, ShieldAlert, ShieldCheck, Loader2, FileText, CheckCircle2, 
  Image as ImageIcon, Code2, LayoutGrid, Save, LogOut, Settings, Plus, 
  Download, Trash2, Facebook, Globe, Send, X, Clock, File, Eye, EyeOff
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from './lib/firebase';
import { encryptContent, decryptContent } from './lib/crypto';
import { cn } from './lib/utils';

type AppState = 'loading' | 'setup' | 'locked' | 'dashboard';

interface FileItem {
  id: string;
  name: string;
  size: string;
  link: string;
}

interface VaultData {
  photo: FileItem[];
  pdf: FileItem[];
  code: FileItem[];
  others: FileItem[];
}

const defaultVault: VaultData = { photo: [], pdf: [], code: [], others: [] };
type TabKey = keyof VaultData;

const toBengaliNumber = (num: number | string) => {
  const engToBen: Record<string, string> = { '0':'০', '1':'১', '2':'২', '3':'৩', '4':'৪', '5':'৫', '6':'৬', '7':'৭', '8':'৮', '9':'৯' };
  return num.toString().replace(/[0-9]/g, match => engToBen[match]);
};

export default function App() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [ciphertext, setCiphertext] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string>('');
  
  // Setup state
  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmPassword, setSetupConfirmPassword] = useState('');
  const [setupError, setSetupError] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);

  // Unlock state
  const [unlockPassword, setUnlockPassword] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  
  // Dashboard state
  const [vaultData, setVaultData] = useState<VaultData>(defaultVault);
  const [activeTab, setActiveTab] = useState<TabKey>('photo');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', size: '', link: '' });
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsView, setSettingsView] = useState<'password' | 'delete'>('password');
  const [resetPwd, setResetPwd] = useState({ old: '', new: '', confirm: '' });
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Visibility states
  const [showSetupPwd, setShowSetupPwd] = useState(false);
  const [showSetupConfirmPwd, setShowSetupConfirmPwd] = useState(false);
  const [showUnlockPwd, setShowUnlockPwd] = useState(false);
  const [showResetOld, setShowResetOld] = useState(false);
  const [showResetNew, setShowResetNew] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Downloading animation state
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});

  // Auto-lock timer state (Strict 2-minute session)
  const [timeLeft, setTimeLeft] = useState(120);

  useEffect(() => {
    if (appState !== 'dashboard') {
      setTimeLeft(120);
      return;
    }

    const intervalId = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          lockVault();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [appState]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const docRef = doc(db, 'appConfig', 'contentLocker');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().ciphertext) {
          setCiphertext(docSnap.data().ciphertext);
          setAppState('locked');
        } else {
          // Auto-setup with default password 7236
          const defaultPassword = '7236';
          const encrypted = encryptContent(JSON.stringify(defaultVault), defaultPassword);
          await setDoc(docRef, { ciphertext: encrypted });
          
          setCiphertext(encrypted);
          setAppState('locked');
        }
      } catch (error) {
        console.error('Error fetching config:', error);
        setAppState('setup');
      }
    };

    fetchConfig();
  }, []);

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');

    if (setupPassword.length < 4) {
      setSetupError('পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
      return;
    }
    if (setupPassword !== setupConfirmPassword) {
      setSetupError('পাসওয়ার্ড মিলছে না।');
      return;
    }

    setIsSettingUp(true);
    try {
      const encrypted = encryptContent(JSON.stringify(defaultVault), setupPassword);
      const docRef = doc(db, 'appConfig', 'contentLocker');
      await setDoc(docRef, { ciphertext: encrypted });
      
      setCiphertext(encrypted);
      setSessionKey(setupPassword);
      setVaultData(defaultVault);
      setAppState('dashboard');
      
      setSetupPassword('');
      setSetupConfirmPassword('');
    } catch (error) {
      setSetupError('অ্যাডমিন পাসওয়ার্ড সেট করতে সমস্যা হয়েছে।');
      console.error(error);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError('');
    setIsUnlocking(true);

    if (!ciphertext) {
      setUnlockError('কোনো এনক্রিপ্টেড কনটেন্ট পাওয়া যায়নি।');
      setIsUnlocking(false);
      return;
    }

    setTimeout(() => {
      const decrypted = decryptContent(ciphertext, unlockPassword);
      
      if (decrypted) {
        try {
          const parsed = JSON.parse(decrypted);
          
          const migrate = (val: any): FileItem[] => {
            if (Array.isArray(val)) return val;
            if (typeof val === 'string' && val.trim() !== '') {
              return [{ id: Math.random().toString(36).substr(2, 9), name: 'Legacy Item', size: '-', link: val }];
            }
            return [];
          };

          setVaultData({
            photo: migrate(parsed.photo),
            pdf: migrate(parsed.pdf),
            code: migrate(parsed.code),
            others: migrate(parsed.others),
          });
        } catch {
          setVaultData({ ...defaultVault, others: [{ id: '1', name: 'Legacy Content', size: '-', link: decrypted }] });
        }
        setSessionKey(unlockPassword);
        setAppState('dashboard');
        setUnlockPassword('');
      } else {
        setUnlockError('ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।');
      }
      setIsUnlocking(false);
    }, 300);
  };

  const handleSave = async (dataToSave: VaultData = vaultData, silent = false) => {
    if (!sessionKey) return;
    if (!silent) {
      setIsSaving(true);
      setSaveMessage('');
    }
    
    try {
      const encrypted = encryptContent(JSON.stringify(dataToSave), sessionKey);
      const docRef = doc(db, 'appConfig', 'contentLocker');
      await setDoc(docRef, { ciphertext: encrypted });
      
      setCiphertext(encrypted);
      if (!silent) {
        setSaveMessage('সংরক্ষিত হয়েছে!');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error saving:', error);
      if (!silent) setSaveMessage('সংরক্ষণ ব্যর্থ হয়েছে!');
    } finally {
      if (!silent) setIsSaving(false);
    }
  };

  const lockVault = () => {
    setAppState('locked');
    setVaultData(defaultVault);
    setSessionKey('');
    setShowAddModal(false);
    setShowSettingsModal(false);
    setShowUnlockPwd(false);
    setShowSetupPwd(false);
    setShowSetupConfirmPwd(false);
    setShowResetOld(false);
    setShowResetNew(false);
    setShowResetConfirm(false);
  };

  const addItem = () => {
    if (!newItem.name || !newItem.link) return;
    
    const updatedVault = { ...vaultData };
    updatedVault[activeTab] = [
      ...updatedVault[activeTab], 
      { ...newItem, id: Math.random().toString(36).substr(2, 9) }
    ];
    
    setVaultData(updatedVault);
    handleSave(updatedVault, true); 
    setNewItem({ name: '', size: '', link: '' });
    setShowAddModal(false);
  };

  const deleteItem = (id: string) => {
    const updatedVault = { ...vaultData };
    updatedVault[activeTab] = updatedVault[activeTab].filter(item => item.id !== id);
    setVaultData(updatedVault);
    handleSave(updatedVault, true);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    
    if (resetPwd.old !== sessionKey) {
      setResetError('বর্তমান পাসওয়ার্ড ভুল।');
      return;
    }
    if (resetPwd.new.length < 4) {
      setResetError('নতুন পাসওয়ার্ড কমপক্ষে ৪ অক্ষরের হতে হবে।');
      return;
    }
    if (resetPwd.new !== resetPwd.confirm) {
      setResetError('নতুন পাসওয়ার্ড মিলছে না।');
      return;
    }

    setIsResetting(true);
    try {
      const newEncrypted = encryptContent(JSON.stringify(vaultData), resetPwd.new);
      const docRef = doc(db, 'appConfig', 'contentLocker');
      await setDoc(docRef, { ciphertext: newEncrypted });
      
      setCiphertext(newEncrypted);
      setSessionKey(resetPwd.new);
      setResetSuccess('পাসওয়ার্ড সফলভাবে পরিবর্তন করা হয়েছে!');
      setResetPwd({ old: '', new: '', confirm: '' });
      setTimeout(() => setShowSettingsModal(false), 2000);
    } catch (error) {
      setResetError('পাসওয়ার্ড পরিবর্তন ব্যর্থ হয়েছে।');
    } finally {
      setIsResetting(false);
    }
  };

  const handleDownloadClick = (e: React.MouseEvent, item: FileItem) => {
    e.preventDefault();
    if (downloading[item.id]) return;

    setDownloading(prev => ({ ...prev, [item.id]: true }));
    setTimeout(() => {
      setDownloading(prev => ({ ...prev, [item.id]: false }));
      const url = item.link.startsWith('http') ? item.link : `https://${item.link}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }, 1500);
  };

  const formatTimeBengali = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return toBengaliNumber(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
  };

  const tabs = [
    { id: 'photo' as TabKey, label: 'ফটো', icon: ImageIcon },
    { id: 'pdf' as TabKey, label: 'পিডিএফ', icon: FileText },
    { id: 'code' as TabKey, label: 'কোড', icon: Code2 },
    { id: 'others' as TabKey, label: 'অন্যান্য', icon: LayoutGrid },
  ];

  if (appState === 'loading') {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-950 p-4 sm:p-8">
        <div className="flex flex-col items-center text-blue-400 gap-4">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-lg font-light tracking-wider">ডিক্রিপ্ট হচ্ছে...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col bg-slate-950 selection:bg-blue-500/30 selection:text-blue-100 relative">
      
      {/* Background Ambient Glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none fixed" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-cyan-600/10 blur-[120px] rounded-full pointer-events-none fixed" />

      {/* Main Content Area - Allows natural scrolling if keyboard appears */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full relative z-10">
        <AnimatePresence mode="wait">
          
          {/* SETUP SCREEN */}
          {appState === 'setup' && (
            <motion.div
              key="setup"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-[440px] bg-slate-900/80 backdrop-blur-xl rounded-[40px] shadow-[0_0_40px_-10px_rgba(37,99,235,0.15)] border border-blue-500/20 p-8 sm:p-12 flex flex-col items-center my-auto shrink-0"
            >
              <div className="w-16 h-16 bg-blue-950 border border-blue-800/50 text-blue-400 rounded-[20px] flex items-center justify-center mb-6 shadow-inner">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-blue-300 bg-blue-900/30 px-3 py-1.5 rounded-full inline-flex items-center gap-2 mb-4 border border-blue-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                Vault Initialization
              </div>
              <h2 className="text-2xl font-light text-slate-100 mb-2 tracking-tight">অ্যাডমিন সেটআপ</h2>
              <p className="text-slate-400 text-sm mb-8 text-center leading-relaxed">
                লকারটি ব্যবহারের জন্য প্রথমে একটি শক্তিশালী অ্যাডমিন পাসওয়ার্ড তৈরি করুন।
              </p>
              
              <form onSubmit={handleSetup} className="w-full flex flex-col gap-4">
                {setupError && (
                  <div className="p-3 bg-red-950/50 border border-red-900/50 text-red-400 rounded-xl text-sm flex items-start gap-2">
                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{setupError}</span>
                  </div>
                )}
                
                <div className="w-full relative">
                  <input
                    type={showSetupPwd ? "text" : "password"}
                    value={setupPassword}
                    onChange={(e) => setSetupPassword(e.target.value)}
                    placeholder="অ্যাডমিন পাসওয়ার্ড"
                    className="w-full bg-slate-950/50 border border-blue-900/50 rounded-2xl pl-6 pr-14 py-[18px] text-[16px] text-slate-200 placeholder:text-slate-600 transition-all focus:outline-none focus:border-blue-500 focus:bg-slate-900 focus:ring-4 focus:ring-blue-500/10 font-light"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupPwd(!showSetupPwd)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400 transition-colors p-2"
                  >
                    {showSetupPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <div className="w-full relative">
                  <input
                    type={showSetupConfirmPwd ? "text" : "password"}
                    value={setupConfirmPassword}
                    onChange={(e) => setSetupConfirmPassword(e.target.value)}
                    placeholder="পাসওয়ার্ডটি নিশ্চিত করুন"
                    className="w-full bg-slate-950/50 border border-blue-900/50 rounded-2xl pl-6 pr-14 py-[18px] text-[16px] text-slate-200 placeholder:text-slate-600 transition-all focus:outline-none focus:border-blue-500 focus:bg-slate-900 focus:ring-4 focus:ring-blue-500/10 font-light"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSetupConfirmPwd(!showSetupConfirmPwd)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400 transition-colors p-2"
                  >
                    {showSetupConfirmPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isSettingUp}
                  className="mt-4 w-full py-[18px] bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none flex justify-center items-center gap-2 shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)] border border-blue-400/20"
                >
                  {isSettingUp ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      <span>ভল্ট তৈরি করুন</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* LOCKED SCREEN */}
          {appState === 'locked' && (
            <motion.div
              key="locked"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-[440px] bg-slate-900/80 backdrop-blur-xl rounded-[40px] shadow-[0_0_40px_-10px_rgba(37,99,235,0.15)] border border-blue-500/20 p-8 sm:p-12 flex flex-col items-center my-auto shrink-0"
            >
              <div className="w-20 h-20 bg-slate-950 border border-blue-900 text-blue-500 rounded-[24px] flex items-center justify-center mb-6 shadow-[inset_0_0_20px_rgba(37,99,235,0.1)] relative">
                <div className="absolute inset-0 bg-blue-500/10 rounded-[24px] animate-pulse" />
                <ShieldCheck className="w-10 h-10" />
              </div>
              
              <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-blue-300 bg-blue-900/30 px-3 py-1.5 rounded-full inline-flex items-center gap-2 mb-4 border border-blue-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                Secure Vault
              </div>
              
              <h1 className="text-2xl font-light text-slate-100 mb-2 tracking-tight">অ্যাডমিন অ্যাক্সেস</h1>
              <p className="text-slate-400 text-sm mb-10 text-center leading-relaxed">
                মেইন ড্যাশবোর্ড আনলক করতে আপনার অ্যাডমিন পাসওয়ার্ড প্রদান করুন।
              </p>

              <form onSubmit={handleUnlock} className="w-full space-y-4">
                {unlockError && (
                  <motion.div 
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-950/50 border border-red-900/50 text-red-400 rounded-xl text-sm flex items-center justify-center gap-2"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>{unlockError}</span>
                  </motion.div>
                )}

                <div className="relative w-full">
                  <input
                    type={showUnlockPwd ? "text" : "password"}
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="পাসওয়ার্ড লিখুন"
                    className={cn(
                      "w-full bg-slate-950/50 border border-blue-900/50 rounded-2xl pl-6 pr-14 py-[18px] text-[16px] text-slate-200 transition-all focus:outline-none focus:border-blue-500 focus:bg-slate-900 focus:ring-4 focus:ring-blue-500/10 font-light text-center tracking-[0.3em]",
                      unlockError && "border-red-500/50 focus:border-red-500 focus:ring-red-500/10 bg-red-950/20"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowUnlockPwd(!showUnlockPwd)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-400 transition-colors p-2"
                  >
                    {showUnlockPwd ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={isUnlocking || !unlockPassword}
                  className="mt-6 w-full py-[18px] bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-semibold text-[15px] transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_20px_-5px_rgba(37,99,235,0.4)] border border-blue-400/20 flex justify-center items-center gap-2"
                >
                  {isUnlocking ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Unlock className="w-5 h-5" />
                      <span>আনলক করুন</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}

          {/* DASHBOARD SCREEN */}
          {appState === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              className="w-full max-w-5xl h-[85vh] sm:h-[80vh] bg-slate-900/80 backdrop-blur-xl rounded-[32px] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] border border-blue-500/20 flex flex-col md:flex-row overflow-hidden my-auto"
            >
              {/* Sidebar */}
              <div className="w-full md:w-64 bg-slate-950/50 border-b md:border-b-0 md:border-r border-blue-900/50 p-6 flex flex-col shrink-0">
                <div className="flex items-center justify-between gap-3 mb-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-900/50 rounded-xl flex items-center justify-center border border-blue-700/50 text-blue-400 shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-xl font-light text-slate-100 tracking-wide">Locker</h2>
                      {appState === 'dashboard' && (
                        <span 
                          className={cn(
                            "text-[10px] tracking-widest font-semibold px-1.5 py-0.5 rounded border",
                            timeLeft <= 30 ? "bg-red-950/30 text-red-400 border-red-900/50" : "bg-slate-900 text-slate-400 border-slate-800"
                          )} 
                          title="অটো লক টাইমার"
                        >
                          {formatTimeBengali(timeLeft)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Settings Button (Mobile) */}
                    <button onClick={() => setShowSettingsModal(true)} className="md:hidden p-2 text-slate-400 hover:text-blue-400 transition-colors bg-slate-900 rounded-lg border border-slate-800">
                      <Settings className="w-5 h-5" />
                    </button>
                    {/* Logout Button (Mobile) */}
                    <button onClick={lockVault} className="md:hidden p-2 text-slate-400 hover:text-red-400 transition-colors bg-slate-900 rounded-lg border border-slate-800">
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                
                <nav className="flex md:flex-col gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all whitespace-nowrap shrink-0 md:shrink border",
                          isActive 
                            ? "bg-blue-900/30 text-blue-400 border-blue-500/30 shadow-[inset_0_0_12px_rgba(37,99,235,0.1)]" 
                            : "text-slate-400 border-transparent hover:bg-slate-800/50 hover:text-slate-200"
                        )}
                      >
                        <Icon className={cn("w-4 h-4", isActive ? "text-blue-400" : "text-slate-500")} />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>
                
                {/* Desktop Actions */}
                <div className="mt-auto hidden md:flex flex-col gap-2 pt-8">
                  <button 
                    onClick={() => setShowSettingsModal(true)}
                    className="w-full px-4 py-3 bg-slate-950 hover:bg-blue-950/30 text-slate-400 hover:text-blue-400 border border-slate-800 hover:border-blue-900/50 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    <span>সেটিংস ও ফাইল ডিলিট</span>
                  </button>
                  <button 
                    onClick={lockVault}
                    className="w-full px-4 py-3 bg-slate-950 hover:bg-red-950/30 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-900/50 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>লক করুন</span>
                  </button>
                </div>
              </div>
              
              {/* Main Content Area */}
              <div className="flex-1 p-5 sm:p-8 flex flex-col h-full bg-slate-900/30 min-h-0">
                {/* Dashboard Header - Stable */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-4 border-b border-blue-900/30 pb-5">
                  <div className="flex items-center gap-3">
                    {React.createElement(tabs.find(t => t.id === activeTab)?.icon || FileText, { className: "w-6 h-6 text-blue-500" })}
                    <h3 className="text-xl font-medium text-slate-200">
                      {tabs.find(t => t.id === activeTab)?.label}
                    </h3>
                    <span className="text-xs bg-blue-900/50 text-blue-300 px-2.5 py-1 rounded-md border border-blue-700/50">
                      {toBengaliNumber(vaultData[activeTab].length)}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => setShowAddModal(true)}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-all active:scale-[0.96] flex items-center gap-2 shadow-[0_0_15px_-3px_rgba(37,99,235,0.4)] border border-blue-400/20"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">যুক্ত করুন</span>
                    </button>
                  </div>
                </div>
                
                {/* File Cards List - Scrollable */}
                <div className="flex-1 overflow-y-auto no-scrollbar pt-6 pb-2 pr-1">
                  {vaultData[activeTab].length === 0 ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                      <LayoutGrid className="w-12 h-12 opacity-20" />
                      <p className="font-light text-slate-400">কোনো কনটেন্ট পাওয়া যায়নি</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 auto-rows-max">
                      {vaultData[activeTab].map((item) => {
                        const isDownloading = downloading[item.id];
                        
                        return (
                          <div key={item.id} className="bg-slate-950 p-4 rounded-[20px] border border-blue-900/30 hover:border-blue-700/50 transition-colors flex items-center justify-between gap-4 group">
                            {/* Left: Icon */}
                            <div className="w-12 h-12 rounded-2xl bg-blue-900/20 flex items-center justify-center text-blue-400 shrink-0 border border-blue-900/30">
                               {activeTab === 'photo' ? <ImageIcon className="w-6 h-6"/> : 
                                activeTab === 'pdf' ? <FileText className="w-6 h-6"/> : 
                                activeTab === 'code' ? <Code2 className="w-6 h-6"/> : 
                                <File className="w-6 h-6"/>}
                            </div>
                            
                            {/* Middle: Info */}
                            <div className="min-w-0 flex-1 flex flex-col justify-center">
                              <h4 className="text-slate-200 font-medium truncate text-[15px]" title={item.name}>
                                {item.name}
                              </h4>
                              <p className="text-xs text-slate-500 mt-1 truncate">
                                {item.size || 'Size N/A'}
                              </p>
                            </div>
                            
                            {/* Right: Actions */}
                            <div className="flex items-center shrink-0 h-full">
                              <div className="relative shrink-0 w-11 h-11 flex items-center justify-center overflow-hidden rounded-xl bg-blue-900/10 border border-blue-500/20">
                                {isDownloading && (
                                  <div className="absolute inset-[-100%] bg-[conic-gradient(from_0deg,transparent_0_270deg,#60a5fa_360deg)] animate-[spin_1.5s_linear_infinite]" />
                                )}
                                <a 
                                  href={item.link.startsWith('http') ? item.link : `https://${item.link}`}
                                  onClick={(e) => handleDownloadClick(e, item)}
                                  className={cn(
                                    "absolute inset-[1px] rounded-[10px] flex items-center justify-center transition-colors z-10 cursor-pointer",
                                    isDownloading 
                                      ? "bg-slate-900 text-blue-300" 
                                      : "bg-transparent text-blue-400 group-hover:bg-blue-600/20 group-hover:text-blue-300"
                                  )}
                                  title="ডাউনলোড"
                                >
                                  <Download className="w-5 h-5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* FOOTER - Fixed at bottom */}
      <div className="shrink-0 border-t border-slate-900 bg-slate-950/80 backdrop-blur-md py-4 sm:py-5 flex flex-col items-center justify-center gap-3 z-20 w-full">
        {appState !== 'dashboard' && (
          <div className="flex gap-8 sm:gap-12 shrink-0 mb-2">
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-[0.2em] text-blue-500/70 font-bold mb-1.5">Status</span>
              <span className="text-xs font-medium text-slate-400">
                {appState === 'locked' ? 'Locked & Encrypted' : 'Initializing'}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[10px] uppercase tracking-[0.2em] text-blue-500/70 font-bold mb-1.5">Protocol</span>
              <span className="text-xs font-medium text-slate-400">AES-256 Vault</span>
            </div>
          </div>
        )}
        
        <div className="text-xs font-medium text-slate-500">
          Developed by <span className="text-blue-400 font-semibold tracking-wide">আসিফ ইকবাল</span>
        </div>
        <div className="flex items-center gap-5 text-slate-500">
          <a href="https://www.facebook.com/infoaiqbal" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors p-1">
            <Facebook className="w-4 h-4" />
          </a>
          <a href="https://asifio.blogspot.com" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors p-1">
            <Globe className="w-4 h-4" />
          </a>
          <a href="https://t.me/infoaiqbal" target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors p-1">
            <Send className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* ADD ITEM MODAL */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-slate-900 rounded-[32px] shadow-2xl border border-blue-500/20 p-8 z-10 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <button 
                onClick={() => setShowAddModal(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
              
              <h3 className="text-xl font-light text-slate-100 mb-6">নতুন কনটেন্ট যোগ করুন</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 ml-1 mb-1.5 block">ফাইলের নাম</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    placeholder="যেমন: Project Source Code"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 ml-1 mb-1.5 block">সাইজ (MB)</label>
                  <input
                    type="text"
                    value={newItem.size}
                    onChange={(e) => setNewItem({...newItem, size: e.target.value})}
                    placeholder="যেমন: 25 MB"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 ml-1 mb-1.5 block">ডাউনলোড লিংক</label>
                  <textarea
                    value={newItem.link}
                    onChange={(e) => setNewItem({...newItem, link: e.target.value})}
                    placeholder="https://drive.google.com/..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500 min-h-[100px] resize-none"
                  />
                </div>
                
                <button
                  onClick={addItem}
                  disabled={!newItem.name || !newItem.link}
                  className="w-full py-3 mt-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-all"
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SETTINGS / DELETE MODAL */}
      <AnimatePresence>
        {showSettingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setShowSettingsModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-lg bg-slate-900 rounded-[32px] shadow-2xl border border-blue-500/20 p-8 z-10 max-h-[90vh] flex flex-col"
            >
              <button 
                onClick={() => setShowSettingsModal(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-white z-10"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-center gap-3 mb-6 shrink-0">
                <div className="w-10 h-10 bg-slate-950 rounded-full flex items-center justify-center border border-slate-800 text-slate-300">
                  <Settings className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-light text-slate-100">অ্যাডমিন সেটিংস</h3>
              </div>

              {/* Settings Tabs */}
              <div className="flex gap-2 p-1 bg-slate-950 rounded-xl mb-6 shrink-0 border border-slate-800/50">
                <button 
                  onClick={() => setSettingsView('password')}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                    settingsView === 'password' ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  পাসওয়ার্ড পরিবর্তন
                </button>
                <button 
                  onClick={() => setSettingsView('delete')}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                    settingsView === 'delete' ? "bg-red-950/40 text-red-400" : "text-slate-400 hover:text-red-400/80"
                  )}
                >
                  ফাইল ডিলিট করুন
                </button>
              </div>
              
              {settingsView === 'password' ? (
                <form onSubmit={handleResetPassword} className="space-y-4 overflow-y-auto no-scrollbar pb-2">
                  {resetError && (
                    <div className="p-3 bg-red-950/50 border border-red-900/50 text-red-400 rounded-xl text-sm">
                      {resetError}
                    </div>
                  )}
                  {resetSuccess && (
                    <div className="p-3 bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 rounded-xl text-sm">
                      {resetSuccess}
                    </div>
                  )}
                  
                  <div className="w-full relative">
                    <label className="text-xs font-medium text-slate-400 ml-1 mb-1.5 block">বর্তমান পাসওয়ার্ড</label>
                    <input
                      type={showResetOld ? "text" : "password"}
                      value={resetPwd.old}
                      onChange={(e) => setResetPwd({...resetPwd, old: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetOld(!showResetOld)}
                      className="absolute right-3 top-[30px] text-slate-500 hover:text-blue-400 transition-colors p-1"
                    >
                      {showResetOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="w-full relative">
                    <label className="text-xs font-medium text-slate-400 ml-1 mb-1.5 block">নতুন পাসওয়ার্ড</label>
                    <input
                      type={showResetNew ? "text" : "password"}
                      value={resetPwd.new}
                      onChange={(e) => setResetPwd({...resetPwd, new: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetNew(!showResetNew)}
                      className="absolute right-3 top-[30px] text-slate-500 hover:text-blue-400 transition-colors p-1"
                    >
                      {showResetNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="w-full relative">
                    <label className="text-xs font-medium text-slate-400 ml-1 mb-1.5 block">নতুন পাসওয়ার্ড (পুনরায়)</label>
                    <input
                      type={showResetConfirm ? "text" : "password"}
                      value={resetPwd.confirm}
                      onChange={(e) => setResetPwd({...resetPwd, confirm: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetConfirm(!showResetConfirm)}
                      className="absolute right-3 top-[30px] text-slate-500 hover:text-blue-400 transition-colors p-1"
                    >
                      {showResetConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  <button
                    type="submit"
                    disabled={isResetting || !resetPwd.old || !resetPwd.new}
                    className="w-full py-3 mt-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-medium transition-all flex justify-center items-center gap-2"
                  >
                    {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'পাসওয়ার্ড পরিবর্তন করুন'}
                  </button>
                </form>
              ) : (
                <div className="flex-1 overflow-y-auto no-scrollbar pr-1 flex flex-col gap-3 min-h-[250px]">
                  <p className="text-sm text-slate-400 mb-2">
                    বর্তমান সেকশনের (<span className="text-blue-400">{tabs.find(t => t.id === activeTab)?.label}</span>) ফাইলসমূহ:
                  </p>
                  {vaultData[activeTab].length === 0 ? (
                    <div className="text-center py-10 text-slate-500">কোনো ফাইল নেই</div>
                  ) : (
                    vaultData[activeTab].map(item => (
                      <div key={item.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="text-slate-200 text-sm font-medium truncate">{item.name}</h4>
                          <p className="text-xs text-slate-500">{item.size || 'Size N/A'}</p>
                        </div>
                        <button 
                          onClick={() => deleteItem(item.id)}
                          className="p-2.5 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors shrink-0"
                          title="ডিলিট করুন"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
