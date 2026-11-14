export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type UserRole = 'student' | 'admin' | 'warden' | 'guard'
export type RequestStatus = 'draft' | 'pending_admin' | 'pending_warden' | 'qr_issued' | 'exited' | 'returned' | 'rejected' | 'overdue' | 'cancelled'
export type AlertType = 'outpass_expiring' | 'overdue_return' | 'parent_notification' | 'emergency' | 'guard_check'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          roll_number: string | null
          email: string | null
          name: string | null
          role: UserRole
          phone_number: string | null
          room_number: string | null
          block_name: string | null
          hostel_name: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          roll_number?: string | null
          email?: string | null
          name?: string | null
          role?: UserRole
          phone_number?: string | null
          room_number?: string | null
          block_name?: string | null
          hostel_name?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      students: {
        Row: {
          id: string
          user_id: string | null
          name: string
          email: string
          roll_number: string
          room_number: string
          block_name: string
          parent_name: string
          parent_phone: string
          parent_email: string | null
          phone_number: string | null
          emergency_contact: string | null
          address: string | null
          face_descriptor: Json | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          email: string
          roll_number: string
          room_number: string
          block_name: string
          parent_name: string
          parent_phone: string
          parent_email?: string | null
          phone_number?: string | null
          emergency_contact?: string | null
          address?: string | null
          face_descriptor?: Json | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['students']['Insert']>
      }
      parents: {
        Row: {
          id: string
          student_id: string
          name: string
          relationship: string | null
          phone: string
          email: string | null
          is_primary: boolean
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          name: string
          relationship?: string | null
          phone: string
          email?: string | null
          is_primary?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['parents']['Insert']>
      }
      requests: {
        Row: {
          id: string
          student_id: string
          resubmission_of: string | null
          reason: string
          destination: string | null
          expected_departure: string
          expected_return: string
          actual_departure: string | null
          actual_return: string | null
          status: RequestStatus
          emergency: boolean
          parent_notified: boolean
          parent_notified_at: string | null
          warden_approved_by: string | null
          admin_approved_by: string | null
          warden_remarks: string | null
          admin_remarks: string | null
          rejection_reason: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          student_id: string
          resubmission_of?: string | null
          reason: string
          destination?: string | null
          expected_departure: string
          expected_return: string
          actual_departure?: string | null
          actual_return?: string | null
          status?: RequestStatus
          emergency?: boolean
          parent_notified?: boolean
          parent_notified_at?: string | null
          warden_approved_by?: string | null
          admin_approved_by?: string | null
          warden_remarks?: string | null
          admin_remarks?: string | null
          rejection_reason?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['requests']['Insert']>
      }
      request_history: {
        Row: {
          id: string
          request_id: string
          from_status: RequestStatus | null
          to_status: RequestStatus
          changed_by: string | null
          changed_by_role: UserRole
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          from_status?: RequestStatus | null
          to_status: RequestStatus
          changed_by?: string | null
          changed_by_role: UserRole
          note?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['request_history']['Insert']>
      }
      outpasses: {
        Row: {
          id: string
          request_id: string
          qr_token: string
          qr_code: string | null
          issued_at: string
          expires_at: string
          checked_out_at: string | null
          checked_in_at: string | null
          checked_out_by: string | null
          checked_in_by: string | null
          is_used: boolean
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          qr_token: string
          qr_code?: string | null
          issued_at?: string
          expires_at: string
          checked_out_at?: string | null
          checked_in_at?: string | null
          checked_out_by?: string | null
          checked_in_by?: string | null
          is_used?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['outpasses']['Insert']>
      }
      homebook: {
        Row: {
          id: string
          student_id: string
          outpass_id: string | null
          out_time: string
          in_time: string | null
          expected_return: string | null
          checked_out_by: string | null
          checked_in_by: string | null
          purpose: string | null
          remarks: string | null
          created_at: string
        }
        Insert: {
          id?: string
          student_id: string
          outpass_id?: string | null
          out_time: string
          in_time?: string | null
          expected_return?: string | null
          checked_out_by?: string | null
          checked_in_by?: string | null
          purpose?: string | null
          remarks?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['homebook']['Insert']>
      }
      alerts: {
        Row: {
          id: string
          student_id: string | null
          outpass_id: string | null
          parent_id: string | null
          type: AlertType
          title: string
          message: string
          priority: number
          status: string
          sent_at: string | null
          read_at: string | null
          scheduled_for: string | null
          retry_count: number
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          student_id?: string | null
          outpass_id?: string | null
          parent_id?: string | null
          type: AlertType
          title: string
          message: string
          priority?: number
          status?: string
          sent_at?: string | null
          read_at?: string | null
          scheduled_for?: string | null
          retry_count?: number
          metadata?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['alerts']['Insert']>
      }
      audit_log: {
        Row: {
          id: string
          user_id: string | null
          user_role: UserRole | null
          action: string
          table_name: string | null
          record_id: string | null
          old_data: Json | null
          new_data: Json | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          user_role?: UserRole | null
          action: string
          table_name?: string | null
          record_id?: string | null
          old_data?: Json | null
          new_data?: Json | null
          ip_address?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      expire_outpasses: {
        Args: Record<PropertyKey, never>
        Returns: void
      }
      auto_overdue_unused_outpasses: {
        Args: Record<PropertyKey, never>
        Returns: void
      }
      get_expiring_outpasses: {
        Args: { minutes_before?: number }
        Returns: {
          request_id: string
          student_id: string
          student_name: string
          student_email: string
          parent_email: string
          expires_at: string
        }[]
      }
      get_overdue_returns: {
        Args: Record<PropertyKey, never>
        Returns: {
          request_id: string
          student_id: string
          student_name: string
          student_email: string
          parent_email: string
          expected_return: string
          hours_overdue: number
        }[]
      }
      resubmit_request: {
        Args: {
          old_request_id: string
          new_reason: string
          new_destination: string
          new_expected_departure: string
          new_expected_return: string
        }
        Returns: string
      }
      mark_parent_notified: {
        Args: { request_id: string }
        Returns: void
      }
      get_request_timeline: {
        Args: { p_request_id: string }
        Returns: {
          event_order: number
          from_status: RequestStatus | null
          to_status: RequestStatus
          changed_by_role: UserRole
          note: string | null
          event_time: string
        }[]
      }
    }
    Enums: {
      user_role: UserRole
      request_status: RequestStatus
      alert_type: AlertType
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for common operations
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Specific type exports for convenience
export type Profile = Tables<'profiles'>
export type Student = Tables<'students'>
export type Parent = Tables<'parents'>
export type Request = Tables<'requests'>
export type RequestHistory = Tables<'request_history'>
export type Outpass = Tables<'outpasses'>
export type Homebook = Tables<'homebook'>
export type Alert = Tables<'alerts'>
export type AuditLog = Tables<'audit_log'>

// Insert types
export type InsertProfile = InsertTables<'profiles'>
export type InsertStudent = InsertTables<'students'>
export type InsertParent = InsertTables<'parents'>
export type InsertRequest = InsertTables<'requests'>
export type InsertRequestHistory = InsertTables<'request_history'>
export type InsertOutpass = InsertTables<'outpasses'>
export type InsertHomebook = InsertTables<'homebook'>
export type InsertAlert = InsertTables<'alerts'>
export type InsertAuditLog = InsertTables<'audit_log'>

// Update types
export type UpdateProfile = UpdateTables<'profiles'>
export type UpdateStudent = UpdateTables<'students'>
export type UpdateParent = UpdateTables<'parents'>
export type UpdateRequest = UpdateTables<'requests'>
export type UpdateRequestHistory = UpdateTables<'request_history'>
export type UpdateOutpass = UpdateTables<'outpasses'>
export type UpdateHomebook = UpdateTables<'homebook'>
export type UpdateAlert = UpdateTables<'alerts'>
export type UpdateAuditLog = UpdateTables<'audit_log'>