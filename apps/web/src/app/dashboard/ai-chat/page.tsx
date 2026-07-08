'use client';

import { Bot, ChevronRight, Send, User } from 'lucide-react';
import { useState } from 'react';

const mockProjects = [
  { id: '1', name: 'DeFi Protocol v2' },
  { id: '2', name: 'NFT Marketplace' },
  { id: '3', name: 'Staking Rewards' },
];

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const initialMessages: Message[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content:
      "Hello! I'm your Veridion AI security assistant. I can help you analyze smart contract vulnerabilities, explain findings, suggest fixes, and answer questions about your audits. Select a project and audit to get started, or ask me anything about smart contract security.",
    timestamp: new Date(),
  },
];

const suggestedQuestions = [
  'Explain reentrancy vulnerabilities',
  'How can I fix the access control issue?',
  'What are the most critical findings?',
  'Show gas optimization tips',
  'Summarize the audit results',
];

export default function AiChatPage() {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [selectedProject, setSelectedProject] = useState('');
  const [loading, setLoading] = useState(false);

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // TODO: Replace with actual AI API call
    await new Promise((r) => setTimeout(r, 1500));

    const aiResponses: Record<string, string> = {
      reentrancy:
        "Reentrancy is one of the most dangerous vulnerabilities in smart contracts. It occurs when a contract makes an external call to another contract before updating its own state. The called contract can then recursively call back into the original function, potentially draining funds.\n\nThe fix is the **Checks-Effects-Interactions** pattern:\n1. **Checks**: Validate all preconditions\n2. **Effects**: Update all state variables\n3. **Interactions**: Make external calls last\n\nUsing OpenZeppelin's `ReentrancyGuard` modifier is also a great defense.",
      'access control':
        "The access control issue stems from missing authorization checks on critical functions. Without proper access control (like `onlyOwner` modifiers), anyone can call sensitive functions.\n\n**Recommended fix**:\n- Use OpenZeppelin's `Ownable` or `AccessControl` contracts\n- Implement role-based access with granular permissions\n- Always validate `msg.sender` for privileged operations",
      critical:
        'Based on the audit results, the most critical findings are:\n\n1. **Reentrancy in withdraw function** (CRITICAL) - Can lead to complete fund drainage\n2. **Unprotected selfdestruct** (MEDIUM) - Anyone can destroy the contract\n3. **Missing zero-address checks** (LOW) - Can brick admin functionality\n\nI recommend addressing the critical reentrancy finding immediately before deployment.',
      gas: "Here are the top gas optimization tips for your contracts:\n\n1. **Cache array length**: Store `arr.length` in a local variable before loops\n2. **Use `unchecked` blocks**: For arithmetic in Solidity 0.8+ when you know overflow is impossible\n3. **Pack state variables**: Group `uint128` or smaller types together\n4. **Use `calldata` instead of `memory`**: For function parameters that aren't modified\n5. **Avoid redundant storage reads**: Cache storage values in memory\n\nEstimated savings: 15-30% on gas costs",
      summarize:
        '**Audit Summary for DeFi Protocol v2:**\n\n- **Security Score**: 82/100 (Good)\n- **Total Findings**: 5\n  - 1 Critical (Reentrancy)\n  - 1 High (Access Control)\n  - 1 Medium (Selfdestruct)\n  - 1 Low (Zero-address)\n  - 1 Gas (Loop optimization)\n\n**Key Action Items**:\n1. Fix the reentrancy vulnerability in LiquidPool.sol immediately\n2. Implement proper access control on administrative functions\n3. Add emergency stop restrictions\n\nThe project shows good overall security posture but the critical finding must be resolved before mainnet deployment.',
    };

    const lowerContent = content.toLowerCase();
    let response =
      'I can help you with that! Could you provide more details or select an audit to get specific context about your findings?';

    for (const [keyword, reply] of Object.entries(aiResponses)) {
      if (lowerContent.includes(keyword)) {
        response = reply;
        break;
      }
    }

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, aiMsg]);
    setLoading(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Chat</h1>
          <p className="text-muted-foreground mt-1">
            Ask questions about your audits, vulnerabilities, and security best practices.
          </p>
        </div>

        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="bg-background focus:ring-ring rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2"
        >
          <option value="">All Projects</option>
          {mockProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 gap-6">
        <div className="bg-card flex flex-1 flex-col rounded-xl border shadow-sm">
          <div className="flex-1 space-y-4 overflow-y-auto p-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === 'assistant'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'assistant' ? 'bg-muted/50' : 'bg-primary text-primary-foreground'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <p
                    className={`mt-1 text-xs ${
                      msg.role === 'assistant'
                        ? 'text-muted-foreground'
                        : 'text-primary-foreground/70'
                    }`}
                  >
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-muted/50 rounded-xl px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="bg-primary/60 h-2 w-2 animate-bounce rounded-full [animation-delay:0ms]" />
                    <span className="bg-primary/60 h-2 w-2 animate-bounce rounded-full [animation-delay:150ms]" />
                    <span className="bg-primary/60 h-2 w-2 animate-bounce rounded-full [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about vulnerabilities, fixes, or audit results..."
                  rows={1}
                  className="bg-background placeholder:text-muted-foreground focus:ring-ring w-full resize-none rounded-lg border px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2"
                />
                <button
                  onClick={() => {
                    void sendMessage(input);
                  }}
                  disabled={!input.trim() || loading}
                  className="text-muted-foreground hover:text-foreground absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 disabled:opacity-30"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden w-64 shrink-0 space-y-4 xl:block">
          <div className="bg-card rounded-xl border p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Suggested Questions</h3>
            <div className="mt-3 space-y-1.5">
              {suggestedQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    void sendMessage(q);
                  }}
                  className="text-muted-foreground hover:bg-muted hover:text-foreground flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
                >
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card rounded-xl border p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Quick Stats</h3>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Findings explained</span>
                <span className="font-medium">24</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fixes suggested</span>
                <span className="font-medium">18</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Messages today</span>
                <span className="font-medium">7</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
