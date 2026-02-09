export type UserRole =
  | 'admin'
  | 'user'
  | 'dean'
  | 'quams_coordinator'
  | 'associate_dean'
  | 'department'
  | 'faculty'
  | 'staff'

export interface User {
  id: string
  f_name: string
  l_name: string
  email: string
  role: UserRole
  department?: string
  status: boolean
  avatar?: string
}

export type TabType =
  | 'overview'
  | 'upload'
  | 'repository'
  | 'compliance'
  | 'classification'
  | 'admin'
