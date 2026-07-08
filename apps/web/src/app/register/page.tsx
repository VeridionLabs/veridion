'use client';

import { Eye, EyeOff, Lock, Mail, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export default function RegisterPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const _displayName = formData.get('displayName') as string;
    const _email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('Password must contain uppercase, lowercase, and a number');
      setLoading(false);
      return;
    }

    // TODO: Replace with actual API call
    await new Promise((r) => setTimeout(r, 800));
    toast.success('Account created successfully!');
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
          <h2 className="mt-6 text-2xl font-bold tracking-tight">Create your account</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Start securing your smart contracts today
          </p>
        </div>

        <div className="bg-card rounded-xl border p-6 shadow-sm">
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-5"
          >
            <div>
              <label htmlFor="displayName" className="text-sm font-medium">
                Display name
              </label>
              <div className="relative mt-1.5">
                <User className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <input
                  id="displayName"
                  name="displayName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={50}
                  placeholder="John Doe"
                  className="bg-background placeholder:text-muted-foreground focus:ring-ring w-full rounded-lg border py-2 pl-10 pr-3 text-sm focus:outline-none focus:ring-2"
                />
              </div>
            </div>

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
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <div className="relative mt-1.5">
                <Lock className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  placeholder="Min. 8 characters, uppercase, lowercase, number"
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
              <p className="text-muted-foreground mt-1.5 text-xs">
                Must contain at least 8 characters, one uppercase letter, one lowercase letter, and
                one number.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className="text-muted-foreground mt-6 text-center text-sm">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-medium hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
