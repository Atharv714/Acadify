import { useState, useEffect } from "react";

interface SidebarWidthConfig {
  availableWidth: number;
  sidebarWidth: number;
  isMobile: boolean;
}

export const useSidebarWidth = (): SidebarWidthConfig => {
  const [config, setConfig] = useState<SidebarWidthConfig>({
    availableWidth: typeof window !== "undefined" ? window.innerWidth : 1200,
    sidebarWidth: 0,
    isMobile: true,
  });

  useEffect(() => {
    const calculateWidth = () => {
      const width = window.innerWidth;
      const isMobile = width < 768; // md breakpoint

      let sidebarWidth = 0;
      if (!isMobile) {
        // Check if sidebar is collapsed by looking for the data attribute or class
        const sidebarElement = document.querySelector(
          "[data-sidebar-collapsed]"
        );
        const isCollapsed =
          sidebarElement?.getAttribute("data-sidebar-collapsed") === "true";

        // Alternative: check for the collapsed class on main content
        const mainContent = document.querySelector("main");
        const hasCollapsedClass = mainContent?.classList.contains("md:ml-16");
        const hasExpandedClass = mainContent?.classList.contains("md:ml-64");

        if (hasCollapsedClass || isCollapsed) {
          sidebarWidth = 64; // 16 * 4 (Tailwind w-16)
        } else if (hasExpandedClass) {
          sidebarWidth = 256; // 64 * 4 (Tailwind w-64)
        } else {
          // Default to expanded on desktop
          sidebarWidth = 256;
        }
      }

      const availableWidth = width - sidebarWidth;

      setConfig({
        availableWidth,
        sidebarWidth,
        isMobile,
      });
    };

    // Calculate initial width
    calculateWidth();

    // Listen for window resize
    window.addEventListener("resize", calculateWidth);

    // Listen for sidebar state changes by observing DOM mutations
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "class" ||
            mutation.attributeName === "data-sidebar-collapsed")
        ) {
          calculateWidth();
        }
      });
    });

    // Observe changes to the main element classes
    const mainElement = document.querySelector("main");
    if (mainElement) {
      observer.observe(mainElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    // Observe changes to sidebar data attributes
    const sidebarElement = document.querySelector("aside");
    if (sidebarElement) {
      observer.observe(sidebarElement, {
        attributes: true,
        attributeFilter: ["data-sidebar-collapsed"],
      });
    }

    // Cleanup
    return () => {
      window.removeEventListener("resize", calculateWidth);
      observer.disconnect();
    };
  }, []);

  return config;
};
