'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User } from '@veridion/sdk';
import { Loader2, Save } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { cn } from '@/lib/utils';

const profileSchema = z.object({
  displayName: z
    .string()
    .min(1, 'Display name is required')
    .max(50, 'Display name must be 50 characters or less'),
  avatarUrl: z.string().url('Must be a valid URL').nullable().optional().or(z.literal('')),
});

type ProfileFormData = z.infer<typeof profileSchema>;

async function fetchProfile(): Promise<User> {
  const res = await fetch('/api/users/me', {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json() as Promise<User>;
}

async function updateProfile(data: ProfileFormData): Promise<User> {
  const res = await fetch('/api/users/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  return res.json() as Promise<User>;
}

export function ProfileForm() {
  const queryClient = useQueryClient();

  const {
    data: profile,
    isLoading,
    isError,
    error,
  } = useQuery<User>({
    queryKey: ['profile'],
    queryFn: fetchProfile,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: '',
      avatarUrl: '',
    },
  });

  useEffect(() => {
    if (profile) {
      reset({
        displayName: profile.displayName ?? '',
        avatarUrl: profile.avatarUrl ?? '',
      });
    }
  }, [profile, reset]);

  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Profile updated successfully');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update profile');
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    // Send null for empty/null avatarUrl to match API expectations
    mutation.mutate({
      ...data,
      avatarUrl: data.avatarUrl || null,
    });
  };

  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-card rounded-xl border p-6">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-destructive text-sm font-medium">Failed to load profile</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {error?.message || 'Please try again later.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border p-6">
      <h2 className="text-lg font-semibold">Profile</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Update your display name and avatar URL.
      </p>{' '}
      <form
        onSubmit={(e) => {
          void handleSubmit(onSubmit)(e);
        }}
        className="mt-6 space-y-5"
      >
        <div>
          <label htmlFor="displayName" className="text-sm font-medium">
            Display Name <span className="text-destructive">*</span>
          </label>
          <input
            id="displayName"
            type="text"
            maxLength={50}
            placeholder="Your display name"
            className={cn(
              'bg-background placeholder:text-muted-foreground focus:ring-ring mt-1.5 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
              errors.displayName && 'border-destructive focus:ring-destructive',
            )}
            {...register('displayName')}
          />
          {errors.displayName && (
            <p className="text-destructive mt-1 text-xs">{errors.displayName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={profile?.email ?? ''}
            disabled
            className="bg-muted text-muted-foreground mt-1.5 w-full cursor-not-allowed rounded-lg border px-3 py-2 text-sm"
          />
          <p className="text-muted-foreground mt-1 text-xs">Email cannot be changed.</p>
        </div>

        <div>
          <label htmlFor="avatarUrl" className="text-sm font-medium">
            Avatar URL
          </label>
          <input
            id="avatarUrl"
            type="url"
            placeholder="https://avatars.githubusercontent.com/u/..."
            className={cn(
              'bg-background placeholder:text-muted-foreground focus:ring-ring mt-1.5 w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2',
              errors.avatarUrl && 'border-destructive focus:ring-destructive',
            )}
            {...register('avatarUrl')}
          />
          {errors.avatarUrl && (
            <p className="text-destructive mt-1 text-xs">{errors.avatarUrl.message}</p>
          )}
          {profile?.avatarUrl && (
            <div className="mt-2 flex items-center gap-2">
              <img
                src={profile.avatarUrl}
                alt="Avatar preview"
                className="h-8 w-8 rounded-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <span className="text-muted-foreground text-xs">Current avatar preview</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={!isDirty || mutation.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </button>
          {isDirty && (
            <button
              type="button"
              onClick={() => reset()}
              className="hover:bg-muted inline-flex items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
