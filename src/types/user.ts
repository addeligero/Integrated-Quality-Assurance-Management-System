export type UserRole =
  | 'dean'
  | 'quams_coordinator'
  | 'associate_dean'
  | 'department'
  | 'faculty'
  | 'staff'

export interface User {
  id: string
  role: UserRole
  email: string
  name: string
}
