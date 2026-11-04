"use client"

import React, { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { ProductStats } from "./ProductStats"
import { ProductFilters as ProductFiltersComponent, ProductFilters as IProductFilters } from "./ProductFilters"
import { ProductTable } from "./ProductTable"
import { 
  useProductsWithEnrollments, 
  useProductStats, 
  useCropTypes,
  useDeleteProduct
} from "@/lib/hooks"
import { ProductSorting, SortableProductColumn } from "@/lib/database.types"
import { Plus, Download } from "lucide-react"

export function ProductLibrary() {
  const router = useRouter()
  
  // State for filters, sorting, and pagination
  const [filters, setFilters] = useState<IProductFilters>({
    searchQuery: '',
    status: 'all'
  })
  const [sorting, setSorting] = useState<ProductSorting>({
    column: null,
    direction: 'asc'
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const pageSize = 10

  // Pagination object
  const pagination = useMemo(() => ({
    page: currentPage,
    limit: pageSize
  }), [currentPage, pageSize])

  // Data fetching hooks
  const { 
    data: productsData, 
    isLoading: isProductsLoading, 
    error: productsError 
  } = useProductsWithEnrollments(filters, sorting, pagination)

  const { 
    data: statsData, 
    isLoading: isStatsLoading 
  } = useProductStats()

  const { data: cropTypes = [] } = useCropTypes()

  // Delete product mutation
  const deleteProductMutation = useDeleteProduct()

  // Event handlers
  const handleFiltersChange = (newFilters: IProductFilters) => {
    setFilters(newFilters)
    setCurrentPage(1) // Reset to first page when filters change
  }

  const handleSort = (column: SortableProductColumn) => {
    setSorting(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
  }

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleProductSelect = (productId: string, selected: boolean) => {
    setSelectedProducts(prev => 
      selected 
        ? [...prev, productId]
        : prev.filter(id => id !== productId)
    )
  }

  const handleSelectAll = (selected: boolean) => {
    setSelectedProducts(selected ? (productsData?.products.map((p: any) => p.id) || []) : [])
  }

  // Navigation handlers
  const handleCreateProduct = (method: 'manual' | 'insure-smart') => {
    if (method === 'manual') {
      router.push('/protected/products')
    } else {
      router.push('/protected/insure-smart')
    }
  }

  const handleView = (productId: string) => {
    router.push(`/protected/operations-dashboard/products/${productId}`)
  }

  const handleDuplicate = (productId: string) => {
    // Navigate to duplicate page (to be implemented in future sections)
    console.log('Duplicate product:', productId)
  }

  const handleDelete = async (product: any) => {
    try {
      await deleteProductMutation.mutateAsync(product.id)
      // Remove from selection if selected
      setSelectedProducts(prev => prev.filter(id => id !== product.id))
    } catch (error) {
      console.error('Error deleting product:', error)
    }
  }

  const handleAssign = (productId: string) => {
    router.push(`/protected/operations-dashboard/products/${productId}/assign`)
  }

  const handleExport = () => {
    // Export functionality placeholder
    console.log('Export products library')
  }

  return (
    <div className="p-8 space-y-8">
      {/* Page Header & Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Product Management</h1>
          <p className="text-gray-600 mt-2">Create and manage insurance products</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Create Product Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700 text-white">
                <Plus className="h-5 w-5 mr-2" />
                Create Product
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleCreateProduct('manual')}>
                Manual Builder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleCreateProduct('insure-smart')}>
                InsureSmart
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Export Library Button */}
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-5 w-5 mr-2" />
            Export Library
          </Button>
        </div>
      </div>

      {/* Quick Stats Cards */}
      <ProductStats 
        data={statsData} 
        isLoading={isStatsLoading} 
      />

      {/* Search & Filter Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Search & Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductFiltersComponent
            filters={filters}
            onFiltersChange={handleFiltersChange}
            cropTypes={cropTypes}
            isLoading={isProductsLoading}
          />
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Product Directory</CardTitle>
            {selectedProducts.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
                </span>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ProductTable
            products={productsData?.products || []}
            isLoading={isProductsLoading}
            totalCount={productsData?.total || 0}
            currentPage={currentPage}
            totalPages={productsData?.totalPages || 1}
            pageSize={pageSize}
            selectedProducts={selectedProducts}
            sorting={sorting}
            onProductSelect={handleProductSelect}
            onSelectAll={handleSelectAll}
            onSort={handleSort}
            onPageChange={handlePageChange}
            onView={handleView}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onAssign={handleAssign}
          />
        </CardContent>
      </Card>

      {/* Error handling */}
      {productsError && (
        <div className="text-center py-8">
          <p className="text-red-600">Failed to load products. Please try again.</p>
          <Button 
            variant="outline" 
            onClick={() => window.location.reload()}
            className="mt-4"
          >
            Retry
          </Button>
        </div>
      )}
    </div>
  )
}
