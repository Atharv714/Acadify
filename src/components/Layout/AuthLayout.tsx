"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Card, CardContent } from "@/components/ui/card";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
  className?: string; // Add className prop
}

export default function AuthLayout({
  children,
  title,
  subtitle,
  className, // Destructure className
}: AuthLayoutProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const { theme } = useTheme();

  return (
    <div
      className={`min-h-screen w-full flex items-center justify-center relative overflow-hidden bg-background p-4 md:p-0 ${className || ""}`}
    >
      {" "}
      {/* Apply className */}
      {/* Background decorative elements */}
      {isMounted && (
        <>
          {/* Example of one of your motion.divs - apply this pattern to all */}
          <motion.div
            className="absolute rounded-full bg-primary/5"
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: [0.1, 0.2, 0.15, 0.1, 0.25, 0.1],
              scale: [1, 1.2, 0.9, 1.1, 1, 1.3],
              x: ["0%", "5%", "-5%", "2%", "-2%", "0%"],
              y: ["0%", "-5%", "5%", "-2%", "2%", "0%"],
            }}
            transition={{
              duration: 20,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            // Ensure dynamic styles are also potentially conditional or calculated safely
            style={{
              width: "calc(100px + 10vw)", // Example: make styles less random or based on fixed values if possible
              height: "calc(100px + 10vh)",
              top: "10%", // Example
              left: "20%", // Example
              // If you were using Math.random() for these, move that logic inside useEffect or ensure it's stable
            }}
          />
        </>
      )}
      <div className="w-full max-w-md z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="border-none shadow-xl bg-card/80 backdrop-blur-sm">
            <CardContent className="p-6 pt-8">
              <div className="flex flex-col space-y-2 text-center mb-8">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground">{subtitle}</p>
              </div>
              {children}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
