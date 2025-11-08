"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Toaster, toast } from "sonner";
import { motion } from "framer-motion";

import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import AuthLayout from "@/components/Layout/AuthLayout";

// Form schema with validation
const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type FormValues = z.infer<typeof formSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  // Initialize form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // Handle form submission
  const onSubmit = async (data: FormValues) => {
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      const user = userCredential.user;

      // Check if email is verified
      if (!user.emailVerified) {
        toast.error("Please verify your email before signing in.");
        router.push("/verify-email");
        return;
      }

      // Set a session cookie (in a real app, you'd use a more secure method)
      document.cookie = `session=${userCredential.user.uid}; path=/; max-age=${
        60 * 60 * 24 * 7
      }; SameSite=Lax; Secure`;

      toast.success("Login successful!");
      // Small delay to ensure cookie is set before navigation
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Use hard navigation to bypass any middleware timing issues
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error("Login error:", error);
      let errorMessage = "Failed to login. Please try again.";

      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password"
      ) {
        errorMessage = "Invalid email or password";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage =
          "Too many failed login attempts. Please try again later.";
      }

      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Unified Google Sign In with all scopes
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Core scopes
      provider.addScope("https://www.googleapis.com/auth/userinfo.email");
      provider.addScope("https://www.googleapis.com/auth/userinfo.profile");
      // Classroom scopes
      provider.addScope(
        "https://www.googleapis.com/auth/classroom.courses.readonly"
      );
      provider.addScope(
        "https://www.googleapis.com/auth/classroom.rosters.readonly"
      );
      provider.addScope(
        "https://www.googleapis.com/auth/classroom.coursework.me.readonly"
      );
      provider.addScope(
        "https://www.googleapis.com/auth/classroom.announcements.readonly"
      );
      provider.addScope(
        "https://www.googleapis.com/auth/classroom.courseworkmaterials.readonly"
      );
      // Gmail + Calendar scopes
      provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
      provider.addScope("https://www.googleapis.com/auth/calendar.readonly");
      provider.addScope("https://www.googleapis.com/auth/calendar.events");
      // Incremental & force consent
      provider.setCustomParameters({ include_granted_scopes: "true", prompt: "consent" });

      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Persist extended OAuth token lifetime locally (manual cache) ~ 55m
      const credential = GoogleAuthProvider.credentialFromResult(result);
      const accessToken = credential?.accessToken;
      if (accessToken) {
        const exp = Date.now() + 55 * 60 * 1000;
        sessionStorage.setItem("unified_access_token", accessToken);
        sessionStorage.setItem("unified_token_expires_at", String(exp));
      }

      const userDocRef = doc(db, "users", user.uid);
      const userDoc = await getDoc(userDocRef);
      if (!userDoc.exists()) {
        await setDoc(userDocRef, {
          uid: user.uid,
          email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            emailVerified: true,
            createdAt: serverTimestamp(),
            grantedScopes: [
              "classroom.courses.readonly",
              "classroom.rosters.readonly",
              "classroom.coursework.me.readonly",
              "classroom.announcements.readonly",
              "classroom.courseworkmaterials.readonly",
              "gmail.readonly",
              "calendar.readonly",
              "calendar.events"
            ],
        });
      } else {
        // Merge granted scopes into existing document
        await setDoc(userDocRef, {
          grantedScopes: [
            "classroom.courses.readonly",
            "classroom.rosters.readonly",
            "classroom.coursework.me.readonly",
            "classroom.announcements.readonly",
            "classroom.courseworkmaterials.readonly",
            "gmail.readonly",
            "calendar.readonly",
            "calendar.events"
          ],
          lastScopeRefresh: serverTimestamp(),
        }, { merge: true });
      }

      document.cookie = `session=${user.uid}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax; Secure`;

      toast.success("Google sign-in successful!");
      await new Promise(r => setTimeout(r,100));
      window.location.href = "/dashboard";
    } catch (error: any) {
      console.error("Google Sign In error:", error);
      toast.error("Failed to sign in with Google. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout
      className="montserrat"
      title="Welcome back"
      subtitle="Enter your credentials to access your account"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="montserrat">Email</FormLabel>
                <FormControl>
                  <Input
                    className="montserrat"
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="montserrat">Password</FormLabel>
                <FormControl>
                  <Input
                    className="montserrat"
                    placeholder="••••••••"
                    type="password"
                    autoComplete="current-password"
                    disabled={isLoading}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Signing in...
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </Form>

      <div className="mt-6">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full mt-4 flex items-center justify-center gap-2"
          onClick={handleGoogleSignIn}
          disabled={isLoading}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
            <path d="M1 1h22v22H1z" fill="none" />
          </svg>
          Sign in with Google
        </Button>
      </div>

      <div className="mt-6 text-center text-sm">
        <p className="text-muted-foreground">
          Don't have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
