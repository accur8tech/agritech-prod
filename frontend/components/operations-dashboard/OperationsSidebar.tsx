"use client";

import { User } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { 
  HomeIcon, 
  UsersIcon, 
  CubeIcon, 
  ShieldCheckIcon, 
  CloudIcon, 
  Cog6ToothIcon,
  ChartBarIcon
} from "@heroicons/react/24/outline";
import { cn } from "@/lib/utils";

interface OperationsSidebarProps {
  user: User;
}

const navigationItems = [
  { name: "Home", href: "/protected/operations-dashboard", icon: HomeIcon },
  { name: "Farmers", href: "/protected/operations-dashboard/farmers", icon: UsersIcon },
  { name: "Products", href: "/protected/operations-dashboard/products", icon: CubeIcon },
  { name: "Claims", href: "/protected/operations-dashboard/claims", icon: ShieldCheckIcon },
  { name: "Weather", href: "/protected/weather", icon: CloudIcon },
  { name: "InsureSmart", href: "/protected/insure-smart", icon: ChartBarIcon },
  { name: "Settings", href: "/protected/operations-dashboard/settings", icon: Cog6ToothIcon },
];

export function OperationsSidebar({ user }: OperationsSidebarProps) {
  const pathname = usePathname();
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    const fetchDisplayName = async () => {
      try {
        const { createClient } = await import("@/utils/supabase/client");
        const supabase = createClient();
        const { data: appUserData, error } = await supabase
          .from('app_users')
          .select('display_name')
          .eq('id', user.id)
          .single();
        
        if (appUserData && !error && appUserData.display_name) {
          setDisplayName(appUserData.display_name);
        }
      } catch (error) {
        console.error('Error fetching display name:', error);
      }
    };

    if (user?.id) {
      fetchDisplayName();
    }

    // Listen for display name updates from other components
    const handleDisplayNameUpdate = (event: CustomEvent) => {
      setDisplayName(event.detail.displayName);
    };

    window.addEventListener('displayNameUpdated', handleDisplayNameUpdate as EventListener);

    // Cleanup event listener
    return () => {
      window.removeEventListener('displayNameUpdated', handleDisplayNameUpdate as EventListener);
    };
  }, [user?.id]);

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center">
          <span className="text-2xl font-extrabold">
            <span className="text-green-600">Accu</span>
            <span className="text-green-500">Rate</span>
          </span>
        </div>
        <p className="text-sm text-gray-500 mt-1">Operations Dashboard</p>
      </div>

      {/* User Profile */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <span className="text-green-600 font-semibold text-sm">
              {user.email?.charAt(0).toUpperCase() || "U"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {displayName || user.email || "User"}
            </p>
            <p className="text-xs text-gray-500">Standard User</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                isActive
                  ? "bg-green-100 text-green-700 border-r-2 border-green-600"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className="mr-3 h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 text-center">
          AccuRate v3.2
        </div>
      </div>
    </div>
  );
}
