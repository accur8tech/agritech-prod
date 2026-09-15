import { createClient } from '@/utils/supabase/client'
import { 
  Plot, 
  Product,
  Claim,
  FarmerInsert, 
  PlotInsert, 
  FarmerUpdate, 
  PlotUpdate,
  FarmerWithPlots,
  FarmerFilters,
  FarmerSorting,
  PaginationParams,
  FarmersResponse,
  ProductFilters,
  ProductSorting,
  ProductsResponse,
  ProductWithEnrollments,
  ProductStatsData
} from './database.types'

export type SupabaseClient = ReturnType<typeof createClient>

// Initialize Supabase client
const supabase = createClient()

// Auth helpers
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  return user
}

export const getCurrentAppUser = async () => {
  const user = await getCurrentUser()
  if (!user) return null
  
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', user.id)
    .single()
  
  if (error) throw error
  return data
}

// Farmers service
export class FarmersService {
  // Get farmers with pagination, filtering, and sorting
  static async getFarmers(
    filters: FarmerFilters = {},
    sorting: FarmerSorting = { column: null, direction: 'asc' },
    pagination: PaginationParams = { page: 1, limit: 10 }
  ): Promise<FarmersResponse> {
    // If product filter is applied, we need to change our approach
    const hasProductFilter = filters.product && filters.product !== 'all'
    
    let query = supabase
      .from('farmers')
      .select(`
        *,
        plots (*),
        enrollments ${hasProductFilter ? '!inner' : ''} (
          id,
          product_id,
          status,
          products (
            id,
            name
          )
        )
      `, { count: 'exact' })
      .is('deleted_at', null) // Only active farmers

    // Apply filters
    if (filters.searchQuery) {
      query = query.or(`english_name.ilike.%${filters.searchQuery}%,phone.ilike.%${filters.searchQuery}%,national_id.ilike.%${filters.searchQuery}%`)
    }
    
    if (filters.province && filters.province !== 'all') {
      query = query.eq('province', filters.province)
    }
    
    if (filters.district && filters.district !== 'all') {
      query = query.eq('district', filters.district)
    }
    
    if (filters.commune && filters.commune !== 'all') {
      query = query.eq('commune', filters.commune)
    }
    
    if (filters.kycStatus && filters.kycStatus !== 'all') {
      query = query.eq('kyc_status', filters.kycStatus)
    }

    // Product filter - filter by farmers who have active enrollments with the specified product
    if (filters.product && filters.product !== 'all') {
      query = query
        .eq('enrollments.product_id', filters.product)
        .eq('enrollments.status', 'active')
    }

    // Filter by specific farmer IDs
    if (filters.farmerIds && filters.farmerIds.length > 0) {
      query = query.in('id', filters.farmerIds)
    }

    // Apply sorting
    if (sorting.column) {
      query = query.order(sorting.column, { ascending: sorting.direction === 'asc' })
    } else {
      query = query.order('created_at', { ascending: false }) // Default sort by newest
    }

    // Apply pagination
    const from = (pagination.page - 1) * pagination.limit
    const to = from + pagination.limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) throw error

    // Transform data to include plotsCount and assignedProduct
    const farmers: FarmerWithPlots[] = (data || []).map(farmer => {
      // Get the active enrollment's product name
      const activeEnrollment = farmer.enrollments?.find((e: any) => e.status === 'active')
      const assignedProduct = activeEnrollment?.products?.name || null

      return {
        ...farmer,
        plotsCount: farmer.plots?.length || 0,
        assignedProduct
      }
    })

    return {
      farmers,
      total: count || 0,
      page: pagination.page,
      totalPages: Math.ceil((count || 0) / pagination.limit)
    }
  }

  // Get single farmer by ID with plots
  static async getFarmerById(id: string): Promise<FarmerWithPlots | null> {
    const { data, error } = await supabase
      .from('farmers')
      .select(`
        *,
        plots (*)
      `)
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }

    return {
      ...data,
      plotsCount: data.plots?.length || 0,
      assignedProduct: null // TODO: Get from enrollments table
    }
  }

  // Create farmer with plots
  static async createFarmer(
    farmerData: Omit<FarmerInsert, 'created_by_user_id'>,
    plots: Omit<PlotInsert, 'farmer_id'>[] = []
  ): Promise<FarmerWithPlots> {
    console.log('Creating farmer with data:', farmerData, 'and plots:', plots)
    const user = await getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    // Start transaction
    const { data: farmer, error: farmerError } = await supabase
      .from('farmers')
      .insert({
        ...farmerData,
        created_by_user_id: user.id
      })
      .select()
      .single()

    if (farmerError) {
      console.error('Create farmer error details:', farmerError)
      throw farmerError
    }
    console.log('Farmer created successfully:', farmer)

    // Insert plots if any
    let farmerPlots: Plot[] = []
    if (plots.length > 0) {
      const plotsToInsert = plots.map(plot => ({
        ...plot,
        farmer_id: farmer.id
      }))
      console.log('Inserting plots:', plotsToInsert)
      
      const { data: plotsData, error: plotsError } = await supabase
        .from('plots')
        .insert(plotsToInsert)
        .select()

      if (plotsError) {
        console.error('Create plots error details:', plotsError)
        throw plotsError
      }
      farmerPlots = plotsData || []
      console.log('Plots created successfully:', farmerPlots)
    }

    return {
      ...farmer,
      plots: farmerPlots,
      plotsCount: farmerPlots.length,
      assignedProduct: null
    }
  }

  // Update farmer
  static async updateFarmer(
    id: string,
    updates: FarmerUpdate
  ): Promise<FarmerWithPlots> {
    const { data, error } = await supabase
      .from('farmers')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select(`
        *,
        plots (*)
      `)
      .single()

    if (error) throw error

    return {
      ...data,
      plotsCount: data.plots?.length || 0,
      assignedProduct: null
    }
  }

  // Delete farmer (hard delete for now due to RLS policy)
  static async deleteFarmer(id: string): Promise<void> {
    // First, delete all plots associated with this farmer
    const { error: plotsError } = await supabase
      .from('plots')
      .delete()
      .eq('farmer_id', id)

    if (plotsError) {
      console.error('Delete farmer plots error details:', plotsError)
      throw new Error(`Failed to delete farmer plots: ${plotsError.message}`)
    }

    // Then delete the farmer
    const { error } = await supabase
      .from('farmers')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete farmer error details:', error)
      throw error
    }
  }

  // Get farmer statistics
  static async getFarmerStats() {
    const { count: totalFarmers, error: totalError } = await supabase
      .from('farmers')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)

    const { count: verifiedFarmers, error: verifiedError } = await supabase
      .from('farmers')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('kyc_status', 'verified')

    const { count: pendingKYC, error: pendingError } = await supabase
      .from('farmers')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .eq('kyc_status', 'pending')

    const { count: totalPlots, error: plotsError } = await supabase
      .from('plots')
      .select('*', { count: 'exact', head: true })

    // Recent enrollments (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    
    const { count: recentEnrollments, error: recentError } = await supabase
      .from('farmers')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('enrolment_date', thirtyDaysAgo.toISOString().split('T')[0])

    if (totalError || verifiedError || pendingError || plotsError || recentError) {
      throw new Error('Failed to fetch farmer statistics')
    }

    return {
      totalFarmers: totalFarmers || 0,
      activeEnrollments: verifiedFarmers || 0,
      pendingKYC: pendingKYC || 0,
      totalPlots: totalPlots || 0,
      recentEnrollments: recentEnrollments || 0
    }
  }

  // Get farmer enrollments for Policy History tab
  static async getFarmerEnrollments(farmerId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        id,
        product_id,
        plot_id,
        season,
        premium,
        sum_insured,
        status,
        created_at,
        updated_at,
        product:products (
          id,
          name,
          crop,
          status
        ),
        plot:plots (
          id,
          province,
          district,
          commune,
          crop,
          area_ha
        )
      `)
      .eq('farmer_id', farmerId)
      .order('created_at', { ascending: false })

    if (error) throw error
    
    // Transform the data to match our interface
    const transformedData = (data || []).map((enrollment: any) => ({
      id: enrollment.id,
      product_id: enrollment.product_id,
      plot_id: enrollment.plot_id,
      season: enrollment.season,
      premium: enrollment.premium,
      sum_insured: enrollment.sum_insured,
      status: enrollment.status,
      created_at: enrollment.created_at,
      updated_at: enrollment.updated_at,
      product: enrollment.product,
      plot: enrollment.plot
    }))
    
    return transformedData
  }
}

// Products service
export class ProductsService {
  // Get all products (simplified for dropdown usage)
  static async getProducts() {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, crop, status')
      .eq('status', 'live')
      .order('name', { ascending: true })

    if (error) throw error
    return data || []
  }

  // Get products with pagination, filtering, and sorting for the main products table
  static async getProductsWithEnrollments(
    filters: ProductFilters = {},
    sorting: ProductSorting = { column: null, direction: 'asc' },
    pagination: PaginationParams = { page: 1, limit: 10 }
  ): Promise<ProductsResponse> {
    let query = supabase
      .from('products')
      .select(`
        *,
        enrollments (
          id,
          farmer_id,
          status
        )
      `, { count: 'exact' })

    // Apply filters
    if (filters.searchQuery) {
      query = query.or(`name.ilike.%${filters.searchQuery}%,crop.ilike.%${filters.searchQuery}%`)
    }
    
    if (filters.cropType) {
      query = query.eq('crop', filters.cropType)
    }
    
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status)
    }

    // Region filtering - assuming region is stored as JSONB
    if (filters.province) {
      query = query.contains('region', { province: filters.province })
    }
    
    if (filters.district) {
      query = query.contains('region', { district: filters.district })
    }
    
    if (filters.commune) {
      query = query.contains('region', { commune: filters.commune })
    }

    // Date filtering - filter for products created on the specific date
    if (filters.dateCreatedStart) {
      const selectedDate = filters.dateCreatedStart.toISOString().split('T')[0] // Get YYYY-MM-DD format
      const startOfDay = `${selectedDate}T00:00:00.000Z`
      const endOfDay = `${selectedDate}T23:59:59.999Z`
      
      query = query
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)
    }

    // Coverage window filtering using new date columns
    if (filters.coverageWindowStart) {
      query = query.gte('coverage_start_date', filters.coverageWindowStart.toISOString().split('T')[0])
    }
    
    if (filters.coverageWindowEnd) {
      query = query.lte('coverage_end_date', filters.coverageWindowEnd.toISOString().split('T')[0])
    }

    // Apply sorting
    if (sorting.column) {
      query = query.order(sorting.column, { ascending: sorting.direction === 'asc' })
    } else {
      query = query.order('created_at', { ascending: false }) // Default sort by newest
    }

    // Apply pagination
    const from = (pagination.page - 1) * pagination.limit
    const to = from + pagination.limit - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) throw error

    // Transform data to include enrollment counts
    const products: ProductWithEnrollments[] = (data || []).map(product => ({
      ...product,
      enrollmentCount: product.enrollments?.length || 0
    }))

    return {
      products,
      total: count || 0,
      page: pagination.page,
      totalPages: Math.ceil((count || 0) / pagination.limit)
    }
  }

  // Get product statistics
  static async getProductStats(): Promise<ProductStatsData> {
    // Get total products count
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })

    // Get active products count
    const { count: activeProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'live')

    // Get draft products count
    const { count: draftProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'draft')

    // Get products with enrollments count
    const { data: productsWithEnrollments } = await supabase
      .from('products')
      .select(`
        id,
        enrollments (id)
      `)

    const productsWithEnrollmentsCount = (productsWithEnrollments || [])
      .filter(product => product.enrollments && product.enrollments.length > 0)
      .length

    return {
      totalProducts: totalProducts || 0,
      activeProducts: activeProducts || 0,
      draftProducts: draftProducts || 0,
      productsWithEnrollments: productsWithEnrollmentsCount
    }
  }

  // Get unique crop types for filter dropdown
  static async getCropTypes(): Promise<string[]> {
    const { data, error } = await supabase
      .from('products')
      .select('crop')

    if (error) throw error

    const cropTypes = Array.from(new Set((data || []).map((product: any) => product.crop))) as string[]
    return cropTypes.sort()
  }

  // Get a single product by ID with detailed enrollment data
  static async getProductById(id: string) {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        enrollments (
          id,
          farmer_id,
          plot_id,
          season,
          premium,
          sum_insured,
          status,
          created_at,
          farmer:farmers (
            id,
            english_name,
            phone,
            province,
            district,
            commune
          ),
          plot:plots (
            id,
            province,
            district,
            commune,
            crop,
            area_ha
          )
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  // Create a new product
  static async createProduct(productData: {
    name: string
    crop?: string
    data_type?: string[]
    region: any
    status: 'draft' | 'live'
    triggers: any
    coverage_start_date: string
    coverage_end_date: string
    terms: any
  }): Promise<Product> {
    const user = await getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('products')
      .insert({
        ...productData,
        created_by_user_id: user.id,
        crop: productData.crop || '' // Default to empty string if not provided
      })
      .select()
      .single()

    if (error) {
      console.error('Create product error details:', error)
      throw error
    }

    return data
  }

  // Update an existing product
  static async updateProduct(
    id: string,
    updates: Partial<{
      name: string
      crop: string
      data_type: string[]
      region: any
      status: 'draft' | 'live' | 'archived'
      triggers: any
      coverage_start_date: string
      coverage_end_date: string
      terms: any
    }>
  ): Promise<Product> {
    const { data, error } = await supabase
      .from('products')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update product error details:', error)
      throw error
    }

    return data
  }

  // Delete a product
  static async deleteProduct(id: string): Promise<void> {
    // First, delete all enrollments associated with this product
    const { error: enrollmentsError } = await supabase
      .from('enrollments')
      .delete()
      .eq('product_id', id)

    if (enrollmentsError) {
      console.error('Delete product enrollments error details:', enrollmentsError)
      throw new Error(`Failed to delete product enrollments: ${enrollmentsError.message}`)
    }

    // Then delete the product
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete product error details:', error)
      throw error
    }
  }
}

// Plots service
export class PlotsService {
  // Get plots for a farmer
  static async getFarmerPlots(farmerId: string): Promise<Plot[]> {
    const { data, error } = await supabase
      .from('plots')
      .select('*')
      .eq('farmer_id', farmerId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data || []
  }

  // Create plot
  static async createPlot(plotData: PlotInsert): Promise<Plot> {
    console.log('Creating plot with data:', plotData)
    const { data, error } = await supabase
      .from('plots')
      .insert(plotData)
      .select()
      .single()

    if (error) {
      console.error('Create plot error details:', error)
      throw error
    }
    console.log('Plot created successfully:', data)
    return data
  }

  // Update plot
  static async updatePlot(id: string, updates: PlotUpdate): Promise<Plot> {
    console.log('Updating plot with ID:', id, 'updates:', updates)
    const { data, error } = await supabase
      .from('plots')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update plot error details:', error)
      throw error
    }
    console.log('Plot updated successfully:', data)
    return data
  }

  // Delete plot
  static async deletePlot(id: string): Promise<void> {
    console.log('Deleting plot with ID:', id)
    const { error } = await supabase
      .from('plots')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete plot error details:', error)
      throw error
    }
    console.log('Plot deleted successfully')
  }
}

// Enrollments service
export class EnrollmentsService {
  // Create a single enrollment
  static async createEnrollment(enrollmentData: {
    farmer_id: string
    plot_id: string | null
    product_id: string
    season: string
    premium: number
    sum_insured: number
    status?: 'pending' | 'active' | 'expired' | 'cancelled'
  }) {
    const user = await getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const { data, error } = await supabase
      .from('enrollments')
      .insert({
        created_by_user_id: user.id,
        ...enrollmentData,
        status: enrollmentData.status || 'pending'
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Create multiple enrollments in batch
  static async createBatchEnrollments(enrollments: Array<{
    farmer_id: string
    plot_id: string | null
    product_id: string
    season: string
    premium: number
    sum_insured: number
    status?: 'pending' | 'active' | 'expired' | 'cancelled'
  }>) {
    const user = await getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const enrollmentsWithUser = enrollments.map(enrollment => ({
      created_by_user_id: user.id,
      ...enrollment,
      status: enrollment.status || 'pending'
    }))

    const { data, error } = await supabase
      .from('enrollments')
      .insert(enrollmentsWithUser)
      .select()

    if (error) throw error
    return data
  }

  // Get enrollments for a specific product
  static async getProductEnrollments(productId: string) {
    const { data, error } = await supabase
      .from('enrollments')
      .select(`
        *,
        farmer:farmers(
          id, english_name, phone, province, district, commune
        ),
        plot:plots(
          id, province, district, commune, crop, area_ha
        )
      `)
      .eq('product_id', productId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data
  }
}

// Weather Downloads service
export interface WeatherDownload {
  id: string
  requested_by_user_id: string
  country?: 'Cambodia' | 'Nigeria' | ('Cambodia' | 'Nigeria')[]
  dataset: 'precipitation' | 'temperature'
  provinces: string[]
  districts?: string[]
  communes?: string[]
  date_start: string
  date_end: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  file_url?: string
  error_message?: string
  created_at: string
  updated_at: string
}

export class WeatherDownloadsService {
  // Get all weather downloads for the current user
  static async getWeatherDownloads(): Promise<WeatherDownload[]> {
    const { data, error } = await supabase
      .from('weather_downloads')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  }

  // Get a specific download by ID
  static async getWeatherDownloadById(id: string): Promise<WeatherDownload | null> {
    const { data, error } = await supabase
      .from('weather_downloads')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      if (error.code === 'PGRST116') return null // Not found
      throw error
    }
    return data
  }

  // Subscribe to real-time updates for a specific download
  static subscribeToDownloadUpdates(
    downloadId: string, 
    callback: (download: WeatherDownload) => void
  ) {
    return supabase
      .channel(`weather-download-${downloadId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'weather_downloads',
          filter: `id=eq.${downloadId}`
        },
        (payload) => {
          callback(payload.new as WeatherDownload)
        }
      )
      .subscribe()
  }

  // Subscribe to all download updates for the current user
  static subscribeToAllDownloadUpdates(
    callback: () => void
  ) {
    return supabase
      .channel('weather-downloads-history')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'weather_downloads'
        },
        callback
      )
      .subscribe()
  }

  // Cleanup old weather files (older than 24 hours)
  static async cleanupOldFiles(): Promise<void> {
    // Import apiClient dynamically to avoid circular dependencies
    const { default: apiClient } = await import('@/lib/apiClient');
    await apiClient.post('/api/climate-data/cleanup');
  }
}

// Claims service
export class ClaimsService {
  static async getClaims(status?: Claim['status']) {
    let query = supabase
      .from('claims')
      .select(`
        *,
        enrollment:enrollments(
          id, season, status, sum_insured, premium,
          farmer:farmers(id, english_name, phone),
          product:products(id, name, crop)
        )
      `)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query
    if (error) throw error
    return data || []
  }

  static async getClaimById(id: string) {
    const { data, error } = await supabase
      .from('claims')
      .select(`
        *,
        enrollment:enrollments(
          id, season, status, sum_insured, premium, product_id, farmer_id, plot_id,
          farmer:farmers(id, english_name, phone, province, district, commune),
          plot:plots(id, province, district, commune, crop, area_ha),
          product:products(id, name, crop, triggers, region, coverage_start_date, coverage_end_date)
        )
      `)
      .eq('id', id)
      .single()

    if (error) throw error
    return data
  }

  static async countByStatus(status: Claim['status'] = 'under_process') {
    const { count, error } = await supabase
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .eq('status', status)

    if (error) throw error
    return count || 0
  }

  /** Open claims needing action (under process + legacy pending/approved) */
  static async countOpenClaims() {
    const { count, error } = await supabase
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .in('status', ['under_process', 'pending', 'approved'])

    if (error) throw error
    return count || 0
  }

  static async createClaim(claimData: {
    enrollment_id?: string | null
    name?: string | null
    trigger_window?: string | null
    trigger_value?: number | null
    payout: number
    status?: Claim['status']
    termsheet_snapshot?: any
    peril_breakdown?: any
  }) {
    const user = await getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    const trimmedName = claimData.name?.trim() || null
    if (!trimmedName) {
      throw new Error('Please enter a claim name')
    }

    const { data, error } = await supabase
      .from('claims')
      .insert({
        created_by_user_id: user.id,
        enrollment_id: claimData.enrollment_id ?? null,
        name: trimmedName,
        trigger_window: claimData.trigger_window ?? null,
        trigger_value: claimData.trigger_value ?? null,
        payout: claimData.payout,
        status: claimData.status || 'under_process',
        termsheet_snapshot: claimData.termsheet_snapshot ?? null,
        peril_breakdown: claimData.peril_breakdown ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async updateClaimStatus(
    id: string,
    status: Claim['status'],
    extras?: { notes?: string; rejectionReason?: string }
  ) {
    const user = await getCurrentUser()
    if (!user) throw new Error('User not authenticated')

    if (status === 'rejected' && !extras?.rejectionReason?.trim()) {
      throw new Error('Please provide a reason for rejection')
    }

    const existing = await this.getClaimById(id)
    const snap = existing?.termsheet_snapshot || {}
    const termsheet_snapshot = {
      ...snap,
      meta: {
        ...(snap.meta || {}),
        ...(extras?.notes != null ? { notes: extras.notes } : {}),
        ...(extras?.rejectionReason != null
          ? { rejection_reason: extras.rejectionReason.trim() }
          : {}),
        reviewed_by_user_id: user.id,
        reviewed_at: new Date().toISOString(),
        previous_status: existing?.status,
      },
    }

    const { data, error } = await supabase
      .from('claims')
      .update({
        status,
        termsheet_snapshot,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }
}

// Real-time subscriptions - temporarily disabled due to API compatibility
// export const subscribeToFarmers = (callback: (farmers: Farmer[]) => void) => {
//   return supabase
//     .channel('farmers_changes')
//     .on(
//       'postgres_changes',
//       {
//         event: '*',
//         schema: 'public',
//         table: 'farmers'
//       },
//       callback
//     )
//     .subscribe()
// }

// export const subscribeToPlots = (farmerId: string, callback: (plots: Plot[]) => void) => {
//   return supabase
//     .channel(`plots_changes_${farmerId}`)
//     .on(
//       'postgres_changes',
//       {
//         event: '*',
//         schema: 'public',
//         table: 'plots',
//         filter: `farmer_id=eq.${farmerId}`
//       },
//       callback
//     )
//     .subscribe()
// }
