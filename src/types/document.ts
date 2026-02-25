export type DocumentStatus = 'pending' | 'approved' | 'rejected'

export interface Document {
  id: string
  created_at: string
  user_id: string
  file_name: string
  primary_category: string | null
  secondary_category: string | null
  tags: string[]
  path: string
  extracted_text: string | null
  status: DocumentStatus
  // Join fields
  uploaded_by?: string
}
