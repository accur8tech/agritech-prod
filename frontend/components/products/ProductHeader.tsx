"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { 
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { 
  Copy, 
  Archive, 
  Users, 
  MoreHorizontal,
  TrendingUp,
  DollarSign,
  FileText,
  Pencil,
  Check,
  X,
} from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"
import { ProductWithDetailedEnrollments } from "@/lib/database.types"
import { useUpdateProduct } from "@/lib/hooks"

interface ProductHeaderProps {
  product: ProductWithDetailedEnrollments
}

export function ProductHeader({ product }: ProductHeaderProps) {
  const router = useRouter()
  const updateProduct = useUpdateProduct()
  const [isEditingName, setIsEditingName] = useState(false)
  const [draftName, setDraftName] = useState(product.name)

  useEffect(() => {
    if (!isEditingName) {
      setDraftName(product.name)
    }
  }, [product.name, isEditingName])

  // Calculate metrics
  const totalEnrollments = product.enrollments?.length || 0
  const activeEnrollments = product.enrollments?.filter((e: any) => e.status === 'active').length || 0
  const totalSumInsured = product.enrollments?.reduce((sum: number, e: any) => sum + (e.sum_insured || 0), 0) || 0
  const totalPremium = product.enrollments?.reduce((sum: number, e: any) => sum + (e.premium || 0), 0) || 0

  const handleCopyId = () => {
    navigator.clipboard.writeText(product.id)
    toast.success("Product ID copied to clipboard")
  }

  const handleDuplicate = () => {
    // TODO: Implement duplicate functionality
    toast.info("Duplicate functionality coming soon")
  }

  const handleArchive = () => {
    // TODO: Implement archive functionality
    toast.info("Archive functionality coming soon")
  }

  const handleAssign = () => {
    router.push(`/protected/operations-dashboard/products/${product.id}/assign`)
  }

  const cancelRename = () => {
    setDraftName(product.name)
    setIsEditingName(false)
  }

  const saveRename = async () => {
    const trimmed = draftName.trim()
    if (!trimmed) {
      toast.error("Product name cannot be empty")
      return
    }
    if (trimmed === product.name) {
      setIsEditingName(false)
      return
    }
    try {
      await updateProduct.mutateAsync({
        id: product.id,
        updates: { name: trimmed },
      })
      setIsEditingName(false)
    } catch {
      // toast handled in hook
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'live':
        return 'bg-green-100 text-green-800'
      case 'draft':
        return 'bg-yellow-100 text-yellow-800'
      case 'archived':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/protected/operations-dashboard">Operations Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/protected/operations-dashboard/products">Products</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Product Title and Status */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            {isEditingName ? (
              <div className="flex items-center gap-2 min-w-[16rem] flex-1">
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void saveRename()
                    }
                    if (e.key === "Escape") {
                      e.preventDefault()
                      cancelRename()
                    }
                  }}
                  className="text-2xl font-bold h-11 max-w-xl"
                  autoFocus
                  maxLength={120}
                  disabled={updateProduct.isPending}
                  aria-label="Product name"
                />
                <Button
                  size="sm"
                  onClick={() => void saveRename()}
                  disabled={updateProduct.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={cancelRename}
                  disabled={updateProduct.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-gray-900">{product.name}</h1>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingName(true)}
                  className="h-8 px-2 text-gray-600"
                  aria-label="Rename product"
                  title="Rename product"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </>
            )}
            <Badge className={getStatusColor(product.status)}>
              {product.status.charAt(0).toUpperCase() + product.status.slice(1)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>ID: {product.id.slice(0, 8)}...</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyId}
              className="h-6 px-2"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <span>•</span>
            <span>Last modified: {new Date(product.updated_at).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <Button onClick={handleAssign} className="bg-green-600 hover:bg-green-700">
            <Users className="h-4 w-4 mr-2" />
            Assign to Farmers
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDuplicate}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate Product
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleArchive}>
                <Archive className="h-4 w-4 mr-2" />
                {product.status === 'archived' ? 'Unarchive' : 'Archive'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Quick Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Enrollments</p>
                <p className="text-2xl font-bold text-gray-900">{totalEnrollments}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <TrendingUp className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Active Enrollments</p>
                <p className="text-2xl font-bold text-gray-900">{activeEnrollments}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Sum Insured</p>
                <p className="text-2xl font-bold text-gray-900">${totalSumInsured.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-orange-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Premium</p>
                <p className="text-2xl font-bold text-gray-900">${totalPremium.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
