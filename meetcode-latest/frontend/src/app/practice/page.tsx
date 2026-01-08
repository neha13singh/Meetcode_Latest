"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { questionApi, Question } from '@/lib/api/questions';
import { matchesApi } from '@/lib/api/matches';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CheckCircle2, Circle, ArrowRight, Code2 } from 'lucide-react';
import Navbar from '@/components/Navbar';

export default function PracticePage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadQuestions() {
      try {
        const data = await questionApi.getQuestions();
        setQuestions(data);
      } catch (error) {
        console.error("Failed to load questions", error);
      } finally {
        setLoading(false);
      }
    }
    loadQuestions();
  }, []);

  const handleSolve = async (questionId: string) => {
    try {
      const match = await matchesApi.createMatch({
        mode: 'practice',
        question_id: questionId
      });
      router.push(`/editor/${match.id}`);
    } catch (error) {
      console.error("Failed to start practice match", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-emerald-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white selection:bg-emerald-500/30">
        <Navbar />
        
        <main className="container mx-auto px-6 pt-24 pb-12">
            <div className="flex items-center justify-between mb-12">
                <div>
                    <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
                        Practice Arena
                    </h1>
                    <p className="text-zinc-400 text-lg max-w-2xl">
                        Master algorithms and data structures at your own pace.
                    </p>
                </div>
            </div>

            <div className="grid gap-4">
                {questions.map((q) => (
                    <Card key={q.id} className="p-6 bg-zinc-900/50 border-white/5 hover:border-emerald-500/30 transition-all duration-300 group">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                                <div className={`p-2 rounded-lg ${q.is_solved ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}`}>
                                    {q.is_solved ? <CheckCircle2 className="w-6 h-6" /> : <Code2 className="w-6 h-6" />}
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors mb-1">
                                        {q.title}
                                    </h3>
                                    <div className="flex items-center space-x-3 text-sm">
                                        <Badge variant="outline" className={`
                                            ${q.difficulty === 'easy' ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10' : ''}
                                            ${q.difficulty === 'medium' ? 'text-yellow-400 border-yellow-500/20 bg-yellow-500/10' : ''}
                                            ${q.difficulty === 'hard' ? 'text-red-400 border-red-500/20 bg-red-500/10' : ''}
                                        `}>
                                            {q.difficulty.toUpperCase()}
                                        </Badge>
                                        <span className="text-zinc-500">
                                            {q.avg_solve_time ? `${Math.floor(q.avg_solve_time / 60)} mins` : '15 mins'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            <Button 
                                onClick={() => handleSolve(q.id)}
                                className={`
                                    ${q.is_solved 
                                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300' 
                                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'}
                                    transition-all duration-300
                                `}
                            >
                                {q.is_solved ? 'Solve Again' : 'Solve Challenge'}
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </Card>
                ))}
            </div>
        </main>
    </div>
  );
}
