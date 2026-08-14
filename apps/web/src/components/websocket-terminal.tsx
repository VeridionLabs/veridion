'use client';

import { Play, Terminal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface LogEntry {
  timestamp: string;
  stage: string;
  message: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

interface WebSocketTerminalProps {
  auditId: string;
  onComplete?: () => void;
}

export function WebSocketTerminal({ auditId, onComplete }: WebSocketTerminalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [currentStage, setCurrentStage] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  const stages = [
    'AST Parsing',
    'Plugin Scan',
    'AI Analysis',
    'Verification',
    'On-Chain Attestation',
  ];

  useEffect(() => {
    // Connect to WebSocket
    const ws = new WebSocket(`ws://localhost:3001/ws/audit/${auditId}`);

    ws.onopen = () => {
      setIsConnected(true);
      addLog('Connected to audit pipeline', 'success');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data as string) as LogEntry;
      setLogs((prev) => [...prev, data]);
      setCurrentStage(data.stage);

      if (data.stage === 'On-Chain Attestation' && data.status === 'success') {
        onComplete?.();
      }
    };

    ws.onerror = (error) => {
      addLog('WebSocket error occurred', 'error');
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      setIsConnected(false);
      addLog('Disconnected from audit pipeline', 'info');
    };

    wsRef.current = ws;

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [auditId, onComplete]);

  const addLog = (message: string, status: LogEntry['status']) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      stage: currentStage || 'Initializing',
      message,
      status,
    };
    setLogs((prev) => [...prev, entry]);
  };

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const getStatusColor = (status: LogEntry['status']) => {
    switch (status) {
      case 'success':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      case 'warning':
        return 'text-yellow-500';
      default:
        return 'text-slate-400';
    }
  };

  const getStatusIcon = (status: LogEntry['status']) => {
    switch (status) {
      case 'success':
        return '✓';
      case 'error':
        return '✗';
      case 'warning':
        return '⚠';
      default:
        return '→';
    }
  };

  const getStageProgress = () => {
    const currentIndex = stages.indexOf(currentStage);
    if (currentIndex === -1) return 0;
    return ((currentIndex + 1) / stages.length) * 100;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            Audit Pipeline Terminal
          </CardTitle>
          <div className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 text-sm ${isConnected ? 'text-green-500' : 'text-slate-500'}`}
            >
              <div
                className={`h-2 w-2 rounded-full ${isConnected ? 'animate-pulse bg-green-500' : 'bg-slate-500'}`}
              />
              {isConnected ? 'Live' : 'Disconnected'}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="text-muted-foreground mb-2 flex justify-between text-sm">
            <span>Pipeline Progress</span>
            <span>{Math.round(getStageProgress())}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
              style={{ width: `${getStageProgress()}%` }}
            />
          </div>
          <div className="text-muted-foreground mt-2 flex justify-between text-xs">
            {stages.map((stage, index) => (
              <span
                key={stage}
                className={stages.indexOf(currentStage) >= index ? 'text-primary font-medium' : ''}
              >
                {stage}
              </span>
            ))}
          </div>
        </div>

        {/* Terminal */}
        <div
          ref={terminalRef}
          className="h-96 space-y-1 overflow-y-auto rounded-lg bg-slate-950 p-4 font-mono text-sm text-slate-100"
        >
          {logs.length === 0 && (
            <div className="flex items-center gap-2 text-slate-500">
              <Terminal className="h-4 w-4" />
              Waiting for audit to start...
            </div>
          )}
          {logs.map((log, index) => (
            <div key={index} className="flex gap-2">
              <span className="shrink-0 text-slate-500">
                [{new Date(log.timestamp).toLocaleTimeString()}]
              </span>
              <span className="w-32 shrink-0 text-blue-400">[{log.stage}]</span>
              <span className={getStatusColor(log.status)}>
                {getStatusIcon(log.status)} {log.message}
              </span>
            </div>
          ))}
        </div>

        {/* Current Stage Indicator */}
        {currentStage && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Play className="text-primary h-4 w-4" />
              <span className="font-medium">Current Stage:</span>
              <span className="text-primary">{currentStage}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
