"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Zap, Shield, Swords, Loader2, X } from 'lucide-react';

export default function MatchmakingPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'searching' | 'found'>('idle');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [timeLeft, setTimeLeft] = useState(60);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'searching' && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status, timeLeft]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const connectToWebSocket = () => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const wsUrl = `ws://localhost:8000/ws?token=${token}`;
    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('Connected to WebSocket');
      ws.send(JSON.stringify({
        event: 'queue:join',
        data: { difficulty }
      }));
      setStatus('searching');
      setTimeLeft(60);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatus('idle');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      if (message.event === 'match:found') {
        setStatus('found');
        const { matchId, startTime } = message.data;
        setTimeout(() => {
            router.push(`/editor/${matchId}?startTime=${startTime}`);
        }, 1500);
      } else if (message.event === 'match:practice') {
        const { practiceId } = message.data;
        router.push(`/editor/${practiceId}?mode=practice`);
      }
    };

    ws.onclose = () => {
      console.log('Disconnected');
      if (status === 'searching') {
          setStatus('idle');
      }
    };

    socketRef.current = ws;
  };

  const cancelSearch = () => {
    if (socketRef.current && status === 'searching') {
      socketRef.current.send(JSON.stringify({
        event: 'queue:leave',
        data: { difficulty }
      }));
      socketRef.current.close();
      setStatus('idle');
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      
      {/* Background decoration */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-blue-500/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-purple-500/10 rounded-full blur-[120px]" />

      <Card className="w-full max-w-lg glass-card border-white/5 relative z-10 p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 mb-6 ring-1 ring-white/10">
            <Swords className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-3xl font-bold tracking-tight mb-2">Find a Match</h2>
          <p className="text-zinc-400">Select difficulty level to start searching</p>
        </div>

        {status === 'idle' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-3 gap-3">
              {(['easy', 'medium', 'hard'] as const).map((level) => (
                <button
                  key={level}
                  onClick={() => setDifficulty(level)}
                  className={`relative group p-4 rounded-xl border transition-all duration-300 ${
                    difficulty === level
                      ? 'bg-blue-600/10 border-blue-500/50 text-white shadow-[0_0_20px_-5px_rgba(37,99,235,0.3)]'
                      : 'bg-zinc-900/50 border-white/5 text-zinc-400 hover:bg-zinc-800/50 hover:border-white/10'
                  }`}
                >
                  <div className={`text-sm font-medium capitalize mb-1 ${difficulty === level ? 'text-blue-400' : 'text-zinc-300'}`}>
                    {level}
                  </div>
                  <div className="flex justify-center">
                    {[...Array(level === 'easy' ? 1 : level === 'medium' ? 2 : 3)].map((_, i) => (
                        <div key={i} className={`w-1.5 h-1.5 rounded-full mx-0.5 ${difficulty === level ? 'bg-blue-400' : 'bg-zinc-600'}`} />
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <Button 
                onClick={connectToWebSocket}
                className="w-full h-14 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-xl shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Searching
              <Zap className="w-5 h-5 ml-2 fill-current" />
            </Button>
          </div>
        )}

        {status === 'searching' && (
          <div className="py-8 animate-in fade-in zoom-in duration-300">
            <div className="relative w-32 h-32 mx-auto mb-8">
               {/* Radar Waves */}
               <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping opacity-20" style={{ animationDuration: '3s' }}></div>
               <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping opacity-20 delay-700" style={{ animationDuration: '3s' }}></div>
               
               {/* Center Icon */}
               <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 bg-zinc-900 rounded-full border border-blue-500/30 flex items-center justify-center relative shadow-[0_0_30px_-5px_rgba(59,130,246,0.3)]">
                     <span className="text-2xl font-bold font-mono text-blue-500">{timeLeft}</span>
                  </div>
               </div>
            </div>
            
            <div className="text-center space-y-2">
                <h3 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400 animate-pulse">
                    Looking for opponent...
                </h3>
                <p className="text-zinc-500 text-sm">
                    Difficulty: <span className="capitalize text-zinc-300">{difficulty}</span>
                </p>
                <div className="pt-2 text-xs text-zinc-600">
                    Entering practice mode in {timeLeft}s
                </div>
            </div>
            
            <div className="mt-8 flex justify-center">
                <Button 
                    onClick={cancelSearch}
                    variant="ghost" 
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-6"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel Search
                </Button>
            </div>
          </div>
        )}

        {status === 'found' && (
          <div className="py-12 animate-in fade-in zoom-in duration-500 text-center">
             <div className="w-24 h-24 mx-auto mb-6 bg-emerald-500/10 rounded-full flex items-center justify-center ring-1 ring-emerald-500/30 shadow-[0_0_40px_-10px_rgba(16,185,129,0.3)]">
                <Shield className="w-12 h-12 text-emerald-500" />
             </div>
             <h3 className="text-3xl font-bold text-white mb-2">Match Found!</h3>
             <p className="text-zinc-400">Preparing battleground...</p>
             <div className="mt-6 flex justify-center space-x-1">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
             </div>
          </div>
        )}
      </Card>
    </div>
  );
}
