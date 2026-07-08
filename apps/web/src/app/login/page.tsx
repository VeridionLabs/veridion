'use client';

import { Eye, EyeOff, Lock, Mail, Shield } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const _email = formData.get('email') as string;
    const _password = formData.get('password') as string;

    // TODO: Replace with actual API call
    await new Promise((r) => setTimeout(r, 800));
    toast.success('Welcome back!');
    router.push('/dashboard');
    setLoading(false);
  }

  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <Shield className="text-primary h-10 w-10" />
            <span className="text-3xl font-bold">Veridion</span>
          </Link>
          <h2 className="mt-6 text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground mt-2 text-sm">Sign in to your account to continue</p>
        </div>

        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-5"
          >
            <div>
              <label htmlFor="email" className="text-sm font-medium">
                Email address
              </label>
              <div className="relative mt-1.5">
                <Mail className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  className="bg-background placeholder:text-muted-foreground focus:ring-ring w-full rounded-lg border py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-muted-foreground hover:text-primary text-xs"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative mt-1.5">
                <Lock className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  minLength={8}
                  placeholder="Enter your password"
                  className="bg-background placeholder:text-muted-foreground focus:ring-ring w-full rounded-lg border py-2 pl-10 pr-10 text-sm focus:outline-none focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-muted-foreground hover:text-foreground absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="text-muted-foreground mt-6 text-center text-sm">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary font-medium hover:underline">
              Create one
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
