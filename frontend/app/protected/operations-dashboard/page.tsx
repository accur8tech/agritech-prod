"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { 
  UsersIcon, 
  CubeIcon, 
  ShieldCheckIcon, 
  CloudIcon, 
  ChartBarIcon,
  PlusIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline";
import { useFarmerStats, useProductStats, usePendingClaimsCount } from "@/lib/hooks";

export default function OperationsDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const { data: farmerStats } = useFarmerStats();
  const { data: productStats } = useProductStats();
  const { data: pendingClaimsCount } = usePendingClaimsCount();

  useEffect(() => {
    // Check if user is authenticated
    const checkUser = async () => {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/sign-in");
      } else {
        setUser(user);
      }
    };
    checkUser();
  }, [router]);

  if (!user) {
    return null;
  }

  return (
    <div className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Operations Dashboard</h1>
        <p className="text-gray-600 mt-2">Manage your agricultural insurance operations</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UsersIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Farmers</p>
              <p className="text-2xl font-bold text-gray-900">
                {farmerStats?.totalFarmers || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CubeIcon className="h-6 w-6 text-green-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Active Products</p>
              <p className="text-2xl font-bold text-gray-900">
                {productStats?.activeProducts || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <ShieldCheckIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Open Claims</p>
              <p className="text-2xl font-bold text-gray-900">
                {pendingClaimsCount ?? 0}
              </p>
            </div>
          </div>
        </div>


      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Link 
          href="/protected/operations-dashboard/farmers"
          className="group block p-6 bg-white rounded-lg border border-gray-200 hover:border-green-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
              <PlusIcon className="h-6 w-6 text-blue-600" />
            </div>
            <h3 className="ml-3 text-lg font-semibold text-gray-900">Add New Farmer</h3>
          </div>
          <p className="text-gray-600">Enroll a new farmer into the system</p>
        </Link>

        <Link 
          href="/protected/operations-dashboard/products"
          className="group block p-6 bg-white rounded-lg border border-gray-200 hover:border-green-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
              <CubeIcon className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="ml-3 text-lg font-semibold text-gray-900">Create Product</h3>
          </div>
          <p className="text-gray-600">Design a new insurance product</p>
        </Link>

        <Link 
          href="/protected/insure-smart"
          className="group block p-6 bg-white rounded-lg border border-gray-200 hover:border-green-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
              <ChartBarIcon className="h-6 w-6 text-purple-600" />
            </div>
            <h3 className="ml-3 text-lg font-semibold text-gray-900">InsureSmart</h3>
          </div>
          <p className="text-gray-600">Use AI-powered product optimization</p>
        </Link>

        <Link 
          href="/protected/weather"
          className="group block p-6 bg-white rounded-lg border border-gray-200 hover:border-green-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-cyan-100 rounded-lg group-hover:bg-cyan-200 transition-colors">
              <CloudIcon className="h-6 w-6 text-cyan-600" />
            </div>
            <h3 className="ml-3 text-lg font-semibold text-gray-900">Weather Data</h3>
          </div>
          <p className="text-gray-600">Request and analyze weather information</p>
        </Link>

        <Link 
          href="/protected/operations-dashboard/claims"
          className="group block p-6 bg-white rounded-lg border border-gray-200 hover:border-green-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-yellow-100 rounded-lg group-hover:bg-yellow-200 transition-colors">
              <DocumentTextIcon className="h-6 w-6 text-yellow-600" />
            </div>
            <h3 className="ml-3 text-lg font-semibold text-gray-900">Process Claims</h3>
          </div>
          <p className="text-gray-600">Review and approve insurance claims</p>
        </Link>

        <Link 
          href="/protected/operations-dashboard/settings"
          className="group block p-6 bg-white rounded-lg border border-gray-200 hover:border-green-300 hover:shadow-md transition-all duration-200"
        >
          <div className="flex items-center mb-4">
            <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-gray-200 transition-colors">
              <ExclamationTriangleIcon className="h-6 w-6 text-gray-600" />
            </div>
            <h3 className="ml-3 text-lg font-semibold text-gray-900">Settings</h3>
          </div>
          <p className="text-gray-600">Configure system preferences</p>
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="text-center py-8 text-gray-500">
          <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Coming Soon in Phase 6</p>
          <p className="text-sm">Recent activity tracking will be implemented in the next phase</p>
        </div>
      </div>
    </div>
  );
}
