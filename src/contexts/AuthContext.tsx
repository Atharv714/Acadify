"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import { AppUser } from "@/lib/types"; // Import AppUser

// The local User interface is removed, AppUser from types.ts will be used.

type AuthContextType = {
  user: AppUser | null; // Use AppUser type
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AppUser | null>(null); // Use AppUser type
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // User is signed in, now listen to their Firestore document
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const unsubscribeFirestore = onSnapshot(
          userDocRef,
          (docSnap) => {
            if (docSnap.exists()) {
              setUser({ ...firebaseUser, ...docSnap.data() } as AppUser);
            } else {
              // Handle case where user doc might not exist yet or error
              setUser(firebaseUser as AppUser); // Fallback to FirebaseUser if no Firestore doc
              console.warn(
                "User document not found in Firestore for UID:",
                firebaseUser.uid
              );
            }
            setLoading(false);
          },
          (error) => {
            console.error(
              "Error fetching user document from Firestore:",
              error
            );
            setUser(firebaseUser as AppUser); // Fallback in case of Firestore error
            setLoading(false);
          }
        );
        return () => unsubscribeFirestore(); // Cleanup Firestore listener
      } else {
        // User is signed out
        setUser(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth(); // Cleanup auth listener
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
