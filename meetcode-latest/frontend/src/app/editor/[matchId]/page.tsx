
"use client";

import { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Editor } from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { Play, Send, FileCode, Clock, CheckCircle2, Terminal, Timer as TimerIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { questionApi, Question } from '@/lib/api/questions';
import { submissionApi } from '@/lib/api/submissions';
import { matchesApi } from '@/lib/api/matches';
import SubmissionsList from '@/components/SubmissionsList';

export default function EditorPage() {
  const { matchId } = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [code, setCode] = useState('// Write your solution here\n');
  const [output, setOutput] = useState('');
  const [activeTab, setActiveTab] = useState<'problem' | 'submissions'>('problem');
  const [timeEncoded, setTimeEncoded] = useState<string>('00:00');
  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // Timer Logic
  useEffect(() => {
    // Mode check
    const isPractice = searchParams.get('mode') === 'practice' || (matchId as string).startsWith('practice-');
    const startTimeParam = searchParams.get('startTime');
    let startTime = startTimeParam ? parseInt(startTimeParam) : Date.now();

    const interval = setInterval(() => {
        const now = Date.now();
        let diff = now - startTime;

        if (diff < 0) {
             setTimeEncoded(`Starting in ${Math.ceil(Math.abs(diff) / 1000)}s`);
             return;
        }

        const minutes = Math.floor(diff / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        setTimeEncoded(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [matchId, searchParams]);

  // Fetch Match & Question
  useEffect(() => {
      async function loadMatchData() {
          if (!matchId) return;
          try {
              const id = Array.isArray(matchId) ? matchId[0] : matchId;
              
              // Skip if practice mode with hardcoded slug (optional fallback)
              // But for now, we assume even practice created a match record
              
              const match = await matchesApi.getMatch(id);
              if (match && match.question) {
                  setQuestion(match.question);
                  
                  // Set template if available
                  if (match.question.templates && match.question.templates.length > 0) {
                      const tmpl = match.question.templates.find((t: any) => t.language === 'python');
                      if (tmpl) setCode(tmpl.starter_code);
                  }
              } else {
                  setOutput('Match not found or no question assigned.');
              }
          } catch (error) {
              console.error("Failed to load match data", error);
              setOutput('Error loading match data. Please try again.');
          } finally {
              setLoading(false);
          }
      }
      loadMatchData();
  }, [matchId]);


  useEffect(() => {
    // Connect to WebSocket
    const token = localStorage.getItem('token');
    if (!token || !matchId) return;

    const wsUrl = `ws://localhost:8000/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('Connected to Game WebSocket');
        ws.send(JSON.stringify({
            event: 'match:join',
            data: { matchId }
        }));
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Editor Received:', message);
        
        if (message.event === 'match:completed') {
             const data = message.data;
             const isWinner = data.winnerId === user?.id;
             const resultText = isWinner ? "YOU WON!" : "YOU LOST";
             const resultColor = isWinner ? "text-emerald-500" : "text-red-500";
             
             // Simple alert for now, can be a nice modal
             // Using confirm to allow user to see it and then redirect
             
             // Create a modal overlay via state would be better, but lets verify first
             setShowResultModal(true);
             setMatchResult({ result: isWinner ? 'win' : 'lose' });
             
             setTimeout(() => {
                 window.location.href = '/';
             }, 5000);
        }
    };

    socketRef.current = ws;

    return () => {
        ws.close();
    };
  }, [matchId, user]);
  
  const [showResultModal, setShowResultModal] = useState(false);
  const [matchResult, setMatchResult] = useState<{result: 'win' | 'lose'} | null>(null);

  const handleRun = async () => {
    if (!question) return;
    setRunning(true);
    setOutput('Running test cases...');
    
    try {
        const result = await submissionApi.runCode({
            code,
            language: 'python',
            question_id: question.id,
            match_id: Array.isArray(matchId) ? matchId[0] : matchId
        });
        
        let outputStr = "";
        if (result.error_message) {
            outputStr += `Error: ${result.error_message}\n`;
        }
        
        outputStr += `Status: ${result.status}\n`;
        outputStr += `Passed: ${result.test_cases_passed}/${result.total_test_cases}\n\n`;
        
        result.details.forEach((res: any, idx: number) => {
            outputStr += `Test Case ${idx + 1}: ${res.passed ? 'PASSED' : 'FAILED'}\n`;
            if (!res.passed) {
                if (res.error) outputStr += `  Error: ${res.error}\n`;
                outputStr += `  Expected: ${res.expected}\n`;
                outputStr += `  Actual:   ${res.output}\n`;
            }
            outputStr += `  Time: ${typeof res.execution_time === 'number' ? res.execution_time.toFixed(2) : res.execution_time}ms\n\n`;
        });
        
        setOutput(outputStr);
        
    } catch (error: any) {
        setOutput(`Execution failed: ${error.response?.data?.detail || error.message}`);
    } finally {
        setRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (!question) return;
    
    setOutput('Submitting...');
    try {
         const result = await submissionApi.submitCode({
            code,
            language: 'python',
            question_id: question.id,
            match_id: Array.isArray(matchId) ? matchId[0] : matchId
        });
        
        let outputStr = `Submission Result: ${result.status.toUpperCase()}\n`;
        outputStr += `Passed: ${result.test_cases_passed}/${result.total_test_cases}\n`;
        if (result.status === 'accepted') {
             outputStr += "\nAll test cases passed! Checking match status...";
        } else {
             outputStr += "\nSome test cases failed. Try again.";
        }
        setOutput(outputStr);
    } catch (error: any) {
        setOutput(`Submission failed: ${error.response?.data?.detail || error.message}`);
    }
  };

  if (loading) {
      return <div className="flex items-center justify-center h-screen bg-black text-white">Loading...</div>;
  }

  if (!question) {
      return <div className="flex items-center justify-center h-screen bg-black text-white">Question not found. Please seed the database.</div>;
  }

  return (
    <div className="flex h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black text-white overflow-hidden font-sans relative">
         
         {/* Result Modal */}
         {showResultModal && matchResult && (
             <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                 <div className="bg-zinc-900 border border-white/10 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center transform scale-100">
                     <h2 className={`text-5xl font-black mb-4 ${matchResult.result === 'win' ? 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500' : 'text-zinc-500'}`}>
                         {matchResult.result === 'win' ? 'VICTORY!' : 'DEFEAT'}
                     </h2>
                     <p className="text-zinc-400 text-lg mb-8">
                         {matchResult.result === 'win' 
                            ? "You solved it first! +25 ELO" 
                            : "Better luck next time. -15 ELO"}
                     </p>
                     <p className="text-zinc-500 text-sm animate-pulse">
                         Redirecting to dashboard...
                     </p>
                 </div>
             </div>
         )}
        
        {/* Left Panel: Problem Description */}
        <div className="w-1/2 flex flex-col border-r border-white/5 bg-zinc-900/30 backdrop-blur-sm">
            {/* Header */}
            <div className="h-14 border-b border-white/5 flex items-center px-6 bg-zinc-900/50 backdrop-blur-md">
                <div className="flex space-x-6">
                    <button 
                        onClick={() => setActiveTab('problem')}
                        className={`text-sm font-medium h-14 border-b-2 flex items-center space-x-2 transition-colors ${
                            activeTab === 'problem' 
                            ? 'border-blue-500 text-blue-400' 
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        <FileCode className="w-4 h-4" />
                        <span>Problem</span>
                    </button>
                    <button 
                        onClick={() => setActiveTab('submissions')}
                        className={`text-sm font-medium h-14 border-b-2 flex items-center space-x-2 transition-colors ${
                            activeTab === 'submissions' 
                            ? 'border-blue-500 text-blue-400' 
                            : 'border-transparent text-zinc-400 hover:text-zinc-200'
                        }`}
                    >
                        <Clock className="w-4 h-4" />
                        <span>Submissions</span>
                    </button>
                </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {activeTab === 'problem' ? (
                    <>
                        <div className="flex items-center space-x-3 mb-6">
                            <h1 className="text-3xl font-bold text-white">{question.title}</h1>
                            <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                {question.difficulty}
                            </span>
                        </div>

                        <div className="prose prose-invert max-w-none">
                            <p className="text-zinc-300 text-lg leading-relaxed mb-8">{question.description}</p>
                            
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                                <CheckCircle2 className="w-5 h-5 mr-2 text-blue-500" />
                                Examples
                            </h3>
                            <div className="space-y-4">
                                {question.examples && question.examples.map((ex: any, i: number) => (
                                    <Card key={i} className="bg-zinc-900/50 border-white/5 p-4">
                                        <div className="space-y-2 font-mono text-sm">
                                            <div>
                                                <span className="text-zinc-500">Input:</span> 
                                                <span className="text-zinc-200 ml-2">{ex.input}</span>
                                            </div>
                                            <div>
                                                <span className="text-zinc-500">Output:</span>
                                                <span className="text-emerald-400 ml-2">{ex.output}</span>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    </>
                ) : (
                    <SubmissionsList questionId={question.id} />
                )}
            </div>
        </div>

        {/* Right Panel: Editor & Console */}
        <div className="w-1/2 flex flex-col bg-zinc-950/50">
            {/* Editor Header */}
            <div className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-zinc-900/50 backdrop-blur-md">
                 <div className="flex items-center space-x-4">
                     <div className="flex items-center space-x-2 px-3 py-1 rounded-md bg-white/5 border border-white/5">
                        <span className="text-xs text-zinc-400 font-mono">Python 3</span>
                     </div>
                     
                     {/* Timer Display */}
                     <div className="flex items-center space-x-2 px-3 py-1 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        <TimerIcon className="w-4 h-4" />
                        <span className="text-sm font-medium font-mono tabular-nums">{timeEncoded}</span>
                     </div>
                 </div>
                 
                 <div className="flex items-center space-x-3">
                     <Button 
                        onClick={handleRun} 
                        disabled={running}
                        variant="ghost" 
                        size="sm" 
                        className="h-9 px-4 text-zinc-300 hover:text-white hover:bg-white/10"
                     >
                        <Play className={`w-4 h-4 mr-2 fill-current ${running ? 'animate-pulse' : ''}`} />
                        {running ? 'Running...' : 'Run'}
                     </Button>
                     <Button 
                        onClick={handleSubmit}
                        disabled={running}
                        size="sm" 
                        className="h-9 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-500/20 border-0"
                     >
                        <Send className="w-4 h-4 mr-2" />
                        Submit
                     </Button>
                 </div>
            </div>

            {/* Editor Area */}
            <div className="flex-grow relative">
                <Editor
                    height="100%"
                    defaultLanguage="python"
                    theme="vs-dark"
                    value={code}
                    onChange={(val) => setCode(val || '')}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 15,
                        fontFamily: 'var(--font-mono)',
                        lineHeight: 24,
                        padding: { top: 24 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        roundedSelection: true,
                    }}
                />
            </div>

            {/* Console/Output */}
            <div className="h-1/3 border-t border-white/5 bg-zinc-900/80 backdrop-blur-xl flex flex-col">
                <div className="h-10 flex items-center justify-between px-4 border-b border-white/5 bg-white/5">
                    <div className="flex items-center space-x-2 text-zinc-400">
                        <Terminal className="w-4 h-4" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Console</span>
                    </div>
                    <button 
                        onClick={() => setOutput('')} 
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors uppercase font-medium"
                    >
                        Clear
                    </button>
                </div>
                <div className="flex-1 p-4 font-mono text-sm text-zinc-300 overflow-y-auto whitespace-pre-wrap custom-scrollbar">
                    {output ? (
                        <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                            {output}
                        </div>
                    ) : (
                        <span className="text-zinc-600 italic">Run your code to see output...</span>
                    )}
                </div>
            </div>
        </div>
    </div>
  );
}
