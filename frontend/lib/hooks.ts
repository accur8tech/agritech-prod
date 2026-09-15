"use client"

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FarmersService, PlotsService, ProductsService, ClaimsService } from './supabase'
import { 
  FarmerFilters, 
  FarmerSorting, 
  PaginationParams, 
  FarmerWithPlots,
  FarmerInsert,
  PlotInsert,
  FarmerUpdate,
  PlotUpdate,
  PlotFormData,
  ProductFilters,
  ProductSorting,
  ClaimStatus
} from './database.types'
import { toast } from 'sonner'

// Query keys
export const farmerKeys = {
  all: ['farmers'] as const,
  lists: () => [...farmerKeys.all, 'list'] as const,
  list: (filters: FarmerFilters, sorting: FarmerSorting, pagination: PaginationParams) => 
    [...farmerKeys.lists(), { filters, sorting, pagination }] as const,
  details: () => [...farmerKeys.all, 'detail'] as const,
  detail: (id: string) => [...farmerKeys.details(), id] as const,
  stats: () => [...farmerKeys.all, 'stats'] as const,
}

export const plotKeys = {
  all: ['plots'] as const,
  lists: () => [...plotKeys.all, 'list'] as const,
  list: (farmerId: string) => [...plotKeys.lists(), farmerId] as const,
}

export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (filters: ProductFilters, sorting: ProductSorting, pagination: PaginationParams) => 
    [...productKeys.lists(), { filters, sorting, pagination }] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  stats: () => [...productKeys.all, 'stats'] as const,
  cropTypes: () => [...productKeys.all, 'cropTypes'] as const,
  regions: () => [...productKeys.all, 'regions'] as const,
}

export const enrollmentKeys = {
  all: ['enrollments'] as const,
  lists: () => [...enrollmentKeys.all, 'list'] as const,
  list: (farmerId: string) => [...enrollmentKeys.lists(), farmerId] as const,
}

export const claimKeys = {
  all: ['claims'] as const,
  lists: () => [...claimKeys.all, 'list'] as const,
  list: (status?: ClaimStatus) => [...claimKeys.lists(), status ?? 'all'] as const,
  details: () => [...claimKeys.all, 'detail'] as const,
  detail: (id: string) => [...claimKeys.details(), id] as const,
  pendingCount: () => [...claimKeys.all, 'pendingCount'] as const,
}

export function useClaims(status?: ClaimStatus) {
  return useQuery({
    queryKey: claimKeys.list(status),
    queryFn: () => ClaimsService.getClaims(status),
    staleTime: 60 * 1000,
  })
}

export function useClaim(id: string) {
  return useQuery({
    queryKey: claimKeys.detail(id),
    queryFn: () => ClaimsService.getClaimById(id),
    enabled: !!id,
  })
}

export function usePendingClaimsCount() {
  return useQuery({
    queryKey: claimKeys.pendingCount(),
    queryFn: () => ClaimsService.countOpenClaims(),
    staleTime: 60 * 1000,
  })
}

export function useCreateClaim() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof ClaimsService.createClaim>[0]) =>
      ClaimsService.createClaim(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claimKeys.all })
      toast.success('Saved to claims list')
    },
    onError: (error: any) => {
      console.error('Error creating claim:', error)
      toast.error(error?.message || 'Could not save. Please try again.')
    },
  })
}

export function useUpdateClaimStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      status,
      notes,
      rejectionReason,
    }: {
      id: string
      status: ClaimStatus
      notes?: string
      rejectionReason?: string
    }) => ClaimsService.updateClaimStatus(id, status, { notes, rejectionReason }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: claimKeys.all })
      const labels: Record<string, string> = {
        under_process: 'moved to under process',
        clear: 'marked as clear',
        rejected: 'rejected',
        paid: 'marked as paid',
        pending: 'moved to under process',
        approved: 'moved to under process',
      }
      toast.success(`Claim ${labels[vars.status] || vars.status}`)
    },
    onError: (error: any) => {
      console.error('Error updating claim:', error)
      toast.error(error?.message || 'Could not update claim. Please try again.')
    },
  })
}

// Farmer enrollments hook
export function useFarmerEnrollments(farmerId: string) {
  return useQuery<any[]>({
    queryKey: enrollmentKeys.list(farmerId),
    queryFn: () => FarmersService.getFarmerEnrollments(farmerId),
    enabled: !!farmerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

// Farmers hooks
export function useFarmers(
  filters: FarmerFilters = {},
  sorting: FarmerSorting = { column: null, direction: 'asc' },
  pagination: PaginationParams = { page: 1, limit: 10 }
) {
  return useQuery({
    queryKey: farmerKeys.list(filters, sorting, pagination),
    queryFn: () => FarmersService.getFarmers(filters, sorting, pagination),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useFarmer(id: string) {
  return useQuery({
    queryKey: farmerKeys.detail(id),
    queryFn: () => FarmersService.getFarmerById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useFarmerStats() {
  return useQuery({
    queryKey: farmerKeys.stats(),
    queryFn: () => FarmersService.getFarmerStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useCreateFarmer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      farmerData, 
      plots = [] 
    }: { 
      farmerData: Omit<FarmerInsert, 'created_by_user_id'>, 
      plots?: PlotFormData[] 
    }) => {
      // Convert PlotFormData to PlotInsert format
      const plotInserts = plots.map(plot => ({
        ...plot,
        village: plot.village || null,
        location_lat: plot.location_lat || null,
        location_long: plot.location_long || null,
      }))
      return FarmersService.createFarmer(farmerData, plotInserts)
    },
    onSuccess: (data) => {
      // Invalidate farmers list queries
      queryClient.invalidateQueries({ queryKey: farmerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: farmerKeys.stats() })
      
      // Add the new farmer to cache
      queryClient.setQueryData(farmerKeys.detail(data.id), data)
      
      toast.success(`Farmer ${data.english_name} has been created successfully!`)
    },
    onError: (error: any) => {
      console.error('Error creating farmer:', error)
      toast.error('Failed to create farmer. Please try again.')
    },
  })
}

export function useUpdateFarmer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string, 
      updates: FarmerUpdate 
    }) => {
      return FarmersService.updateFarmer(id, updates)
    },
    onSuccess: (data) => {
      // Update the specific farmer in cache
      queryClient.setQueryData(farmerKeys.detail(data.id), data)
      
      // Invalidate farmers list queries
      queryClient.invalidateQueries({ queryKey: farmerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: farmerKeys.stats() })
      
      toast.success(`Farmer ${data.english_name} has been updated successfully!`)
    },
    onError: (error: any) => {
      console.error('Error updating farmer:', error)
      toast.error('Failed to update farmer. Please try again.')
    },
  })
}

export function useDeleteFarmer() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => FarmersService.deleteFarmer(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: farmerKeys.detail(deletedId) })
      
      // Invalidate farmers list queries
      queryClient.invalidateQueries({ queryKey: farmerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: farmerKeys.stats() })
      
      toast.success('Farmer has been deleted successfully!')
    },
    onError: (error: any) => {
      console.error('Error deleting farmer:', error)
      toast.error('Failed to delete farmer. Please try again.')
    },
  })
}

// Plots hooks
export function useFarmerPlots(farmerId: string) {
  return useQuery({
    queryKey: plotKeys.list(farmerId),
    queryFn: () => PlotsService.getFarmerPlots(farmerId),
    enabled: !!farmerId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useCreatePlot() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (plotData: PlotInsert) => PlotsService.createPlot(plotData),
    onSuccess: (data) => {
      // Invalidate all queries that might be affected
      queryClient.invalidateQueries({ queryKey: plotKeys.list(data.farmer_id) })
      queryClient.invalidateQueries({ queryKey: farmerKeys.detail(data.farmer_id) })
      queryClient.invalidateQueries({ queryKey: farmerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: farmerKeys.stats() })
      
      toast.success('Plot has been created successfully!')
    },
    onError: (error: any) => {
      console.error('Error creating plot:', error)
      toast.error('Failed to create plot. Please try again.')
    },
  })
}

export function useUpdatePlot() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string, 
      updates: PlotUpdate 
    }) => {
      return PlotsService.updatePlot(id, updates)
    },
    onSuccess: (data) => {
      // Invalidate all queries that might be affected
      queryClient.invalidateQueries({ queryKey: plotKeys.list(data.farmer_id) })
      queryClient.invalidateQueries({ queryKey: farmerKeys.detail(data.farmer_id) })
      queryClient.invalidateQueries({ queryKey: farmerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: farmerKeys.stats() })
      
      toast.success('Plot has been updated successfully!')
    },
    onError: (error: any) => {
      console.error('Error updating plot:', error)
      toast.error('Failed to update plot. Please try again.')
    },
  })
}

export function useDeletePlot() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ id, farmerId }: { id: string, farmerId?: string }) => {
      await PlotsService.deletePlot(id)
      return { id, farmerId }
    },
    onSuccess: (data) => {
      // If we know the farmer ID, invalidate specific queries
      if (data.farmerId) {
        queryClient.invalidateQueries({ queryKey: plotKeys.list(data.farmerId) })
        queryClient.invalidateQueries({ queryKey: farmerKeys.detail(data.farmerId) })
      }
      
      // Always invalidate these broader queries
      queryClient.invalidateQueries({ queryKey: farmerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: farmerKeys.stats() })
      
      toast.success('Plot has been deleted successfully!')
    },
    onError: (error: any) => {
      console.error('Error deleting plot:', error)
      toast.error('Failed to delete plot. Please try again.')
    },
  })
}

// Products hooks
export function useProducts() {
  return useQuery({
    queryKey: productKeys.all,
    queryFn: () => ProductsService.getProducts(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

export function useProductsWithEnrollments(
  filters: ProductFilters = {},
  sorting: ProductSorting = { column: null, direction: 'asc' },
  pagination: PaginationParams = { page: 1, limit: 10 }
) {
  return useQuery({
    queryKey: productKeys.list(filters, sorting, pagination),
    queryFn: () => ProductsService.getProductsWithEnrollments(filters, sorting, pagination),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export function useProductStats() {
  return useQuery({
    queryKey: productKeys.stats(),
    queryFn: () => ProductsService.getProductStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  })
}

export function useCropTypes() {
  return useQuery({
    queryKey: productKeys.cropTypes(),
    queryFn: () => ProductsService.getCropTypes(),
    staleTime: 10 * 60 * 1000, // 10 minutes
  })
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: () => ProductsService.getProductById(id),
    enabled: !!id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}


export function useCreateProduct() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (productData: {
      name: string
      crop?: string
      region: any
      status: 'draft' | 'live'
      triggers: any
      coverage_start_date: string
      coverage_end_date: string
      terms: any
    }) => ProductsService.createProduct(productData),
    onSuccess: (data) => {
      // Invalidate and refetch product-related queries
      queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.stats() })
      queryClient.invalidateQueries({ queryKey: productKeys.cropTypes() })
      queryClient.invalidateQueries({ queryKey: productKeys.regions() })
      
      toast.success(`Product "${data.name}" has been created successfully!`)
    },
    onError: (error: any) => {
      console.error('Error creating product:', error)
      toast.error('Failed to create product. Please try again.')
    },
  })
}

export function useUpdateProduct() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string, 
      updates: Partial<{
        name: string
        crop: string
        region: any
        status: 'draft' | 'live' | 'archived'
        triggers: any
        coverage_start_date: string
        coverage_end_date: string
        terms: any
      }>
    }) => {
      return ProductsService.updateProduct(id, updates)
    },
    onSuccess: (data) => {
      // Invalidate and refetch product-related queries
      queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.stats() })
      
      toast.success(`Product "${data.name}" has been updated successfully!`)
    },
    onError: (error: any) => {
      console.error('Error updating product:', error)
      toast.error('Failed to update product. Please try again.')
    },
  })
}

export function useDeleteProduct() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (id: string) => ProductsService.deleteProduct(id),
    onSuccess: (_, deletedId) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: productKeys.detail(deletedId) })
      
      // Invalidate products list queries
      queryClient.invalidateQueries({ queryKey: productKeys.lists() })
      queryClient.invalidateQueries({ queryKey: productKeys.stats() })
      
      toast.success('Product has been deleted successfully!')
    },
    onError: (error: any) => {
      console.error('Error deleting product:', error)
      toast.error('Failed to delete product. Please try again.')
    },
  })
}

// Optimistic updates helper
export function useOptimisticFarmerUpdate() {
  const queryClient = useQueryClient()
  
  const updateFarmerOptimistically = (id: string, updates: Partial<FarmerWithPlots>) => {
    queryClient.setQueryData(
      farmerKeys.detail(id),
      (old: FarmerWithPlots | undefined) => {
        if (!old) return old
        return { ...old, ...updates }
      }
    )
  }
  
  return { updateFarmerOptimistically }
}
