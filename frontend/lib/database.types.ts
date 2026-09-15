// Database types matching the Supabase schema
export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string
          name: string
          type: 'insurer' | 'bank' | 'mfi' | 'aggregator' | 'agent'
          status: 'active' | 'suspended'
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          type: 'insurer' | 'bank' | 'mfi' | 'aggregator' | 'agent'
          status?: 'active' | 'suspended'
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          type?: 'insurer' | 'bank' | 'mfi' | 'aggregator' | 'agent'
          status?: 'active' | 'suspended'
          created_at?: string
        }
      }
      app_users: {
        Row: {
          id: string
          org_id: string
          role: 'owner' | 'standard'
          email: string
          display_name: string | null
          nda_version: string | null
          nda_accepted_at: string | null
          access_revoked_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          org_id: string
          role?: 'owner' | 'standard'
          email: string
          display_name?: string | null
          nda_version?: string | null
          nda_accepted_at?: string | null
          access_revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          org_id?: string
          role?: 'owner' | 'standard'
          email?: string
          display_name?: string | null
          nda_version?: string | null
          nda_accepted_at?: string | null
          access_revoked_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      nda_acceptances: {
        Row: {
          id: string
          user_id: string
          accepted_at: string
          nda_title: string
          nda_pdf_url: string
          nda_sha256: string
          ip: string
          user_agent: string
          locale: string | null
          country: string | null
          country_code: string | null
          region: string | null
          city: string | null
          latitude: number | null
          longitude: number | null
          timezone: string | null
          email_sent_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          accepted_at?: string
          nda_title: string
          nda_pdf_url: string
          nda_sha256: string
          ip: string
          user_agent: string
          locale?: string | null
          country?: string | null
          country_code?: string | null
          region?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          timezone?: string | null
          email_sent_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          accepted_at?: string
          nda_title?: string
          nda_pdf_url?: string
          nda_sha256?: string
          ip?: string
          user_agent?: string
          locale?: string | null
          country?: string | null
          country_code?: string | null
          region?: string | null
          city?: string | null
          latitude?: number | null
          longitude?: number | null
          timezone?: string | null
          email_sent_at?: string | null
        }
      }
      farmers: {
        Row: {
          id: string
          created_by_user_id: string
          english_name: string
          sex: 'male' | 'female' | 'other'
          phone: string
          national_id: string
          dob: string | null
          enrolment_date: string
          province: string
          district: string
          commune: string
          village: string | null
          kyc_status: 'pending' | 'verified' | 'rejected'
          bank_account_usd: string | null
          bank_account_khr: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by_user_id: string
          english_name: string
          sex: 'male' | 'female' | 'other'
          phone: string
          national_id: string
          dob?: string | null
          enrolment_date: string
          province: string
          district: string
          commune: string
          village?: string | null
          kyc_status?: 'pending' | 'verified' | 'rejected'
          bank_account_usd?: string | null
          bank_account_khr?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by_user_id?: string
          english_name?: string
          sex?: 'male' | 'female' | 'other'
          phone?: string
          national_id?: string
          dob?: string | null
          enrolment_date?: string
          province?: string
          district?: string
          commune?: string
          village?: string | null
          kyc_status?: 'pending' | 'verified' | 'rejected'
          bank_account_usd?: string | null
          bank_account_khr?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      plots: {
        Row: {
          id: string
          farmer_id: string
          province: string
          district: string
          commune: string
          village: string | null
          location_lat: number | null
          location_long: number | null
          crop: string
          area_ha: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          farmer_id: string
          province: string
          district: string
          commune: string
          village?: string | null
          location_lat?: number | null
          location_long?: number | null
          crop: string
          area_ha: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          farmer_id?: string
          province?: string
          district?: string
          commune?: string
          village?: string | null
          location_lat?: number | null
          location_long?: number | null
          crop?: string
          area_ha?: number
          created_at?: string
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          created_by_user_id: string
          name: string
          crop: string
          data_type: string[] // Array of data types (precipitation, temperature)
          region: string | any // jsonb
          status: 'draft' | 'live' | 'archived'
          triggers: any // jsonb
          coverage_start_date: string
          coverage_end_date: string
          terms: any // jsonb
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by_user_id: string
          name: string
          crop: string
          data_type?: string[] // Array of data types (precipitation, temperature)
          region: string | any
          status?: 'draft' | 'live' | 'archived'
          triggers: any
          coverage_start_date: string
          coverage_end_date: string
          terms: any
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by_user_id?: string
          name?: string
          crop?: string
          data_type?: string[] // Array of data types (precipitation, temperature)
          region?: string | any
          status?: 'draft' | 'live' | 'archived'
          triggers?: any
          coverage_start_date?: string
          coverage_end_date?: string
          terms?: any
          created_at?: string
          updated_at?: string
        }
      }
      enrollments: {
        Row: {
          id: string
          created_by_user_id: string
          farmer_id: string
          plot_id: string | null
          product_id: string
          season: string
          premium: number
          sum_insured: number
          status: 'pending' | 'active' | 'expired' | 'cancelled'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by_user_id: string
          farmer_id: string
          plot_id?: string | null
          product_id: string
          season: string
          premium: number
          sum_insured: number
          status?: 'pending' | 'active' | 'expired' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by_user_id?: string
          farmer_id?: string
          plot_id?: string | null
          product_id?: string
          season?: string
          premium?: number
          sum_insured?: number
          status?: 'pending' | 'active' | 'expired' | 'cancelled'
          created_at?: string
          updated_at?: string
        }
      }
      claims: {
        Row: {
          id: string
          created_by_user_id: string
          enrollment_id: string | null
          name: string | null
          trigger_window: string | null
          trigger_value: number | null
          payout: number
          status: 'under_process' | 'clear' | 'paid' | 'rejected' | 'pending' | 'approved'
          termsheet_snapshot: any
          peril_breakdown: any
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          created_by_user_id: string
          enrollment_id?: string | null
          name?: string | null
          trigger_window?: string | null
          trigger_value?: number | null
          payout: number
          status?: 'under_process' | 'clear' | 'paid' | 'rejected' | 'pending' | 'approved'
          termsheet_snapshot?: any
          peril_breakdown?: any
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          created_by_user_id?: string
          enrollment_id?: string | null
          name?: string | null
          trigger_window?: string | null
          trigger_value?: number | null
          payout?: number
          status?: 'under_process' | 'clear' | 'paid' | 'rejected' | 'pending' | 'approved'
          termsheet_snapshot?: any
          peril_breakdown?: any
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Application types derived from database types
export type Organization = Database['public']['Tables']['organizations']['Row']
export type AppUser = Database['public']['Tables']['app_users']['Row']
export type Farmer = Database['public']['Tables']['farmers']['Row']
export type Plot = Database['public']['Tables']['plots']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type Enrollment = Database['public']['Tables']['enrollments']['Row']
export type Claim = Database['public']['Tables']['claims']['Row']
export type ClaimInsert = Database['public']['Tables']['claims']['Insert']
export type ClaimUpdate = Database['public']['Tables']['claims']['Update']
export type ClaimStatus = Claim['status']
export type ClaimSource = 'enrollment' | 'product' | 'manual'

// Insert types
export type FarmerInsert = Database['public']['Tables']['farmers']['Insert']
export type PlotInsert = Database['public']['Tables']['plots']['Insert']

// Update types
export type FarmerUpdate = Database['public']['Tables']['farmers']['Update']
export type PlotUpdate = Database['public']['Tables']['plots']['Update']

// Extended types for UI components
export interface FarmerWithPlots extends Farmer {
  plots?: Plot[]
  plotsCount?: number
  assignedProduct?: string | null
}

export interface FarmerFilters {
  searchQuery?: string
  province?: string
  district?: string
  commune?: string
  kycStatus?: 'all' | 'pending' | 'verified' | 'rejected'
  product?: string
  farmerIds?: string[]
}

// Define sortable farmer columns (exclude virtual/computed fields)
export type SortableFarmerColumn = 
  | 'english_name'
  | 'sex' 
  | 'phone'
  | 'national_id'
  | 'dob'
  | 'enrolment_date'
  | 'province'
  | 'district'
  | 'commune'
  | 'village'
  | 'kyc_status'
  | 'bank_account_usd'
  | 'bank_account_khr'
  | 'created_at'
  | 'updated_at'

export interface FarmerSorting {
  column: SortableFarmerColumn | null
  direction: 'asc' | 'desc'
}

// Create a plot interface for forms (without farmer_id since it's set during submission)
export interface PlotFormData {
  province: string
  district: string
  commune: string
  village?: string | null
  location_lat?: number | null
  location_long?: number | null
  crop: string
  area_ha: number
}

export interface PaginationParams {
  page: number
  limit: number
}

export interface FarmersResponse {
  farmers: FarmerWithPlots[]
  total: number
  page: number
  totalPages: number
}

// Product-related types for UI components
export interface ProductWithEnrollments extends Product {
  enrollmentCount?: number
  enrollments?: Array<{
    id: string
    farmer_id: string
    status: string
  }>
}

// Detailed product type for the product detail page
export interface ProductWithDetailedEnrollments extends Product {
  enrollments?: Array<{
    id: string
    farmer_id: string
    plot_id: string | null
    season: string
    premium: number
    sum_insured: number
    status: 'pending' | 'active' | 'expired' | 'cancelled'
    created_at: string
    farmer: {
      id: string
      english_name: string
      phone: string
      province: string
      district: string
      commune: string
    }
    plot: {
      id: string
      province: string
      district: string
      commune: string
      crop: string
      area_ha: number
    } | null
  }>
}

export interface ProductFilters {
  searchQuery?: string
  cropType?: string
  province?: string
  district?: string
  commune?: string
  status?: 'all' | 'draft' | 'live' | 'archived'
  coverageWindowStart?: Date
  coverageWindowEnd?: Date
  dateCreatedStart?: Date
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

export interface ProductsResponse {
  products: ProductWithEnrollments[]
  total: number
  page: number
  totalPages: number
}

export interface ProductStatsData {
  totalProducts: number
  activeProducts: number
  draftProducts: number
  productsWithEnrollments: number
  trends?: {
    totalProductsTrend?: number
    activeProductsTrend?: number
    draftProductsTrend?: number
    productsWithEnrollmentsTrend?: number
  }
}

// Farmer enrollment interface for Policy History tab
export interface FarmerEnrollment {
  id: string
  product_id: string
  plot_id: string | null
  season: string
  premium: number
  sum_insured: number
  status: 'pending' | 'active' | 'expired' | 'cancelled'
  created_at: string
  updated_at: string
  product: {
    id: string
    name: string
    crop: string
    status: 'draft' | 'live' | 'archived'
  }
  plot: {
    id: string
    province: string
    district: string
    commune: string
    crop: string
    area_ha: number
  } | null
}