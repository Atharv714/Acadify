"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, reload } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import AuthLayout from "@/components/Layout/AuthLayout";
import { toast } from "sonner";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(true);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    const checkEmailVerification = async () => {
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          // Reload user to get latest verification status
          await reload(user);

          if (user.emailVerified) {
            // Update user document in Firestore
            await updateDoc(doc(db, "users", user.uid), {
              emailVerified: true,
            });

            setIsVerified(true);
            toast.success("Email verified successfully!");

            // Redirect to onboarding after a short delay
            setTimeout(() => {
              router.push("/onboarding");
            }, 2000);
          }
        } else {
          router.push("/login");
        }
        setIsVerifying(false);
      });

      return () => unsubscribe();
    };

    checkEmailVerification();
  }, [router]);

  const handleRefresh = async () => {
    setIsVerifying(true);
    if (auth.currentUser) {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          emailVerified: true,
        });
        setIsVerified(true);
        toast.success("Email verified successfully!");
        setTimeout(() => {
          router.push("/onboarding");
        }, 2000);
      } else {
        toast.error("Email not verified yet. Please check your email.");
      }
    }
    setIsVerifying(false);
  };

  if (isVerifying) {
    return (
      <AuthLayout
        className="montserrat"
        title="Verifying..."
        subtitle="Please wait"
      >
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        </div>
      </AuthLayout>
    );
  }

  if (isVerified) {
    return (
      <AuthLayout
        className="montserrat"
        title="Email Verified!"
        subtitle="Redirecting you to onboarding..."
      >
        <div className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-6 h-6 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <p className="text-green-600">
            Your email has been verified successfully!
          </p>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      className="montserrat"
      title="Verify Your Email"
      subtitle="Click the link in your email"
    >
      <div className="text-center space-y-4">
        <div className="mx-auto w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
          <svg
            className="w-6 h-6 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 3.26a2 2 0 001.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p className="text-muted-foreground">
          Please check your email and click the verification link to continue.
        </p>
        <Button onClick={handleRefresh} variant="outline" className="w-full">
          I've verified my email
        </Button>
        <Button
          onClick={() => router.push("/signup")}
          variant="ghost"
          className="w-full"
        >
          Back to Sign Up
        </Button>
      </div>
    </AuthLayout>
  );
}
