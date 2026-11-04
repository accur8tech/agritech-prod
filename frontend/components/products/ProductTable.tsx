"use client"

import React from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  ArrowUpDown,
  MoreVertical,
  Eye,
  Copy,
  Trash2,
  Users,
  Package
} from "lucide-react"
import { Product } from "@/lib/database.types"

export interface ProductWithEnrollments extends Product {
  enrollmentCount?: number
  enrollments?: Array<{
    id: string
    farmer_id: string
    status: string
  }>
}

export type SortableProductColumn = 
  | 'name'
  | 'crop'
  | 'status'
  | 'created_at'
  | 'updated_at'

export interface ProductSorting {
  column: SortableProductColumn | null
  direction: 'asc' | 'desc'
}

interface ProductTableProps {
  products: ProductWithEnrollments[]
  isLoading?: boolean
  totalCount?: number
  currentPage?: number
  totalPages?: number
  pageSize?: number
  selectedProducts?: string[]
  sorting?: ProductSorting
  onProductSelect?: (productId: string, selected: boolean) => void
  onSelectAll?: (selected: boolean) => void
  onSort?: (column: SortableProductColumn) => void
  onPageChange?: (page: number) => void
  onView?: (productId: string) => void
  onDuplicate?: (productId: string) => void
  onDelete?: (product: ProductWithEnrollments) => void
  onAssign?: (productId: string) => void
}

export function ProductTable({
  products,
  isLoading = false,
  totalCount = 0,
  currentPage = 1,
  totalPages = 1,
  pageSize = 10,
  selectedProducts = [],
  onProductSelect,
  onSelectAll,
  onSort,
  onPageChange,
  onView,
  onDuplicate,
  onDelete,
  onAssign
}: ProductTableProps) {

  const getStatusBadge = (status: Product['status']) => {
    const variants = {
      draft: 'secondary',
      live: 'default',
      archived: 'outline'
    } as const

    const colors = {
      draft: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      live: 'bg-green-100 text-green-800 border-green-300',
      archived: 'bg-gray-100 text-gray-800 border-gray-300'
    }

    return (
      <Badge variant={variants[status]} className={colors[status]}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const getCropIcon = () => {
    // You can add specific crop icons here
    return <Package className="h-4 w-4 text-green-600" />
  }

  const formatCoverageWindow = (startDate: string, endDate: string) => {
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      
      return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`
    } catch {
      return `${startDate} - ${endDate}`
    }
  }

  const parseRegion = (region: any) => {
    try {
      if (typeof region === 'string') {
        const parsed = JSON.parse(region)
        return `${parsed.province || ''}, ${parsed.district || ''}, ${parsed.commune || ''}`.replace(/^,\s*|,\s*$/g, '')
      } else if (typeof region === 'object' && region) {
        return `${region.province || ''}, ${region.district || ''}, ${region.commune || ''}`.replace(/^,\s*|,\s*$/g, '')
      }
      return String(region)
    } catch {
      return String(region)
    }
  }

  const SortButton = ({ column, children }: { column: SortableProductColumn; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 data-[state=open]:bg-accent"
      onClick={() => onSort?.(column)}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Skeleton className="h-4 w-4" />
                </TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Crop</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Coverage Window</TableHead>
                <TableHead>Enrollments</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: pageSize }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">No products found</h3>
        <p className="text-gray-600 mb-6">Get started by creating your first insurance product.</p>
        <Button>Create Product</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ScrollArea className="rounded-md border h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedProducts.length === products.length && products.length > 0}
                  onCheckedChange={(checked) => onSelectAll?.(checked as boolean)}
                />
              </TableHead>
              <TableHead>
                <SortButton column="name">Product Name</SortButton>
              </TableHead>
              <TableHead>
                <SortButton column="crop">Crop</SortButton>
              </TableHead>
              <TableHead>Region</TableHead>
              <TableHead>
                <SortButton column="status">Status</SortButton>
              </TableHead>
              <TableHead>Coverage Window</TableHead>
              <TableHead className="text-center">Enrollments</TableHead>
              <TableHead>
                <SortButton column="created_at">Created</SortButton>
              </TableHead>
              <TableHead className="w-12">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedProducts.includes(product.id)}
                    onCheckedChange={(checked) => onProductSelect?.(product.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell className="font-medium">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      {getCropIcon()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{product.name}</div>
                      <div className="text-sm text-gray-500">ID: {product.id.slice(0, 8)}...</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    {getCropIcon()}
                    <span className="capitalize">{product.crop}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm text-gray-600">
                    {parseRegion(product.region)}
                  </div>
                </TableCell>
                <TableCell>
                  {getStatusBadge(product.status)}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {formatCoverageWindow(product.coverage_start_date, product.coverage_end_date)}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center space-x-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <span className="font-semibold">{product.enrollmentCount || 0}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {formatDistanceToNow(new Date(product.created_at), { addSuffix: true })}
                  </div>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onView?.(product.id)}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate?.(product.id)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onAssign?.(product.id)}>
                        <Users className="mr-2 h-4 w-4" />
                        Assign to Farmers
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem 
                            className="text-red-600"
                            disabled={false}
                            onSelect={(e) => e.preventDefault()}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. This will permanently delete product{" "}
                              <span className="font-semibold">{product.name}</span>{" "}
                              and remove all their data from our servers.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => onDelete?.(product)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete Product
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} products
        </div>
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious 
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (currentPage > 1) onPageChange?.(currentPage - 1)
                }}
                className={currentPage <= 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
            
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = i + 1
              return (
                <PaginationItem key={page}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      onPageChange?.(page)
                    }}
                    isActive={currentPage === page}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              )
            })}
            
            <PaginationItem>
              <PaginationNext 
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  if (currentPage < totalPages) onPageChange?.(currentPage + 1)
                }}
                className={currentPage >= totalPages ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}
