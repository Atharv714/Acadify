"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";

function slugifyCollege(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function OnboardingContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [collegeName, setCollegeName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
      return;
    }
    const run = async () => {
      if (!user) return;
      try {
        const uref = doc(db, "users", user.uid);
        const snap = await getDoc(uref);
        const data = snap.data();
        if (data?.collegeName) {
          router.push("/dashboard");
          return;
        }
      } catch (e) {
        console.warn("onboarding load", e);
      } finally {
        setIsLoading(false);
      }
    };
    run();
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = collegeName.trim();
    if (name.length < 2) {
      toast.error("Please enter a valid college name");
      return;
    }
    setSaving(true);
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          collegeName: name,
          collegeSlug: slugifyCollege(name),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast.success("Saved");
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 dark:bg-black">
      <div className="w-full max-w-md">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="montserrat font-semibold">
              Enter your College Name
            </CardTitle>
            <CardDescription className="montserrat">
              We will personalize your dashboard using this
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                value={collegeName}
                onChange={(e) => setCollegeName(e.target.value)}
                placeholder="e.g., IIIT Bhubneshwar University"
                className="montserrat"
                disabled={saving}
                required
              />
              <Button
                type="submit"
                className="w-full montserrat"
                disabled={saving}
              >
                {saving ? "Saving..." : "Continue"}
              </Button>
            </form>
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">
              You can change this later in profile settings.
            </p>
          </CardFooter>
        </Card>
      </div>
      <Toaster />
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary" />
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
