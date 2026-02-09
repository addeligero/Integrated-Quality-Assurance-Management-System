# Sidebar Setup Complete

## What was created:

1. **Updated User Types** (`src/types/user.ts`)
   - Added support for `f_name`, `l_name`, `department`, `status`, and `avatar`
   - Added `admin` and `user` roles
   - Defined `TabType` for navigation tabs

2. **Sidebar Component** (`src/components/Sidebar.vue`)
   - Vuetify-based navigation drawer matching the React design
   - User profile popover with avatar upload
   - Role-based menu visibility
   - Logout functionality
   - Orange/brown color scheme matching your branding

3. **Dashboard View** (`src/views/Dashboard.vue`)
   - Main dashboard layout with sidebar
   - Tab-based navigation (Overview, Upload, Repository, Compliance, Classification, Admin)
   - Fetches user profile from Supabase on mount
   - Protected route requiring authentication

4. **Updated Router** (`src/router/index.ts`)
   - Added route guards for authentication
   - Redirects based on auth state

5. **Updated Login Form** (`src/views/Auth/LoginForm.vue`)
   - Removed role selector (roles come from database)
   - Fetches user profile from `profiles` table after login
   - Validates user status before allowing login
   - Proper error handling

6. **Database Migration** (`supabase-migration.sql`)
   - Adds `avatar` column to profiles table
   - Sets up Row Level Security (RLS) policies
   - Users can view/update their own profile
   - Admins can manage all profiles

## How to use:

1. **Run the SQL migration in Supabase:**

   ```sql
   -- Copy and paste the contents of supabase-migration.sql into your Supabase SQL editor
   ```

2. **Install required package:**

   ```bash
   pnpm add lucide-vue-next
   ```

3. **The app flow:**
   - User logs in with email/password
   - System fetches profile from `profiles` table
   - Checks if user is active (`status = true`)
   - Redirects to dashboard with sidebar
   - Sidebar shows menu items based on user role

## Role-based menu access:

- **Everyone**: Dashboard, Upload Documents, Document Repository, Compliance Matrix
- **Associate Dean & Department Head**: + Classification
- **Admin, Dean, QuAMS Coordinator**: + Administration

## User Profile Features:

- Click avatar to open profile menu
- Change profile photo
- View name, role, email, and department
- Photos stored as base64 in database

## Next steps:

1. Run the migration in Supabase
2. Create test users with different roles
3. Implement the actual content for each tab
4. Add document upload functionality
5. Build the repository search and display
