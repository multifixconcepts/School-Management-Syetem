'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useTenant } from '@/hooks/use-tenant';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useState } from 'react';
import type { ComponentType } from 'react';
import Image from 'next/image';
import { extractTenantSubdomain } from '@/utils/tenant-utils';
// import icons
import {
  Users,
  GraduationCap,
  School,
  ClipboardList,
  FileText,
  MessageSquare,
  Settings,
  Building,
  Wrench,
  LogOut,
  UserCheck,
  ChevronDown,
  ChevronRight,
  Home,
  BookOpen,
  Calendar,
  Award,
  Shield,
  ListChecks
} from 'lucide-react';

// Helper function to extract tenant domain from current path
const getTenantDomainFromPath = (pathname: string): string | null => {
  const pathSegments = pathname?.split('/') || [];
  if (pathSegments.length > 1 && pathSegments[1] &&
    !pathSegments[1].startsWith('_') &&
    !pathSegments[1].startsWith('api') &&
    pathSegments[1] !== 'super-admin') {
    return pathSegments[1];
  }
  return null;
};

interface MenuItem {
  name: string;
  href?: string;
  icon: ComponentType<{ className?: string }>;
  children?: MenuItem[];
  requiredPermissions?: string[];
}

function getNavigation(rawRole: string, tenantDomain?: string): MenuItem[] {
  const role = rawRole.toLowerCase().replace(/[-_]/g, '');

  // Super Admin Navigation
  if (role === 'superadmin') {
    return [
      { name: 'Dashboard', href: '/super-admin/dashboard', icon: Home },
      { name: 'Tenant Management', href: '/super-admin/tenants', icon: Building },
      { name: 'System Settings', href: '/super-admin/settings', icon: Wrench },
    ];
  }

  // Admin Navigation
  if (role === 'admin') {
    return [
      { name: 'Dashboard', href: tenantDomain ? `/${tenantDomain}/admin-dashboard` : '/admin-dashboard', icon: Home },
      { name: 'Academic Overview', href: tenantDomain ? `/${tenantDomain}/academics` : '/academics', icon: GraduationCap },

      {
        name: 'Academic Core',
        icon: School,
        children: [
          { name: 'Classes', href: tenantDomain ? `/${tenantDomain}/academics/classes` : '/academics/classes', icon: BookOpen },
          { name: 'Sections', href: tenantDomain ? `/${tenantDomain}/academics/sections` : '/academics/sections', icon: School },
          { name: 'Subjects', href: tenantDomain ? `/${tenantDomain}/academics/subjects` : '/academics/subjects', icon: BookOpen },
          { name: 'Semesters', href: tenantDomain ? `/${tenantDomain}/academics?tab=structure` : '/academics?tab=structure', icon: Calendar },
          { name: 'Timetable', href: tenantDomain ? `/${tenantDomain}/academics/timetables` : '/academics/timetables', icon: Calendar },
          { name: 'Academic Setup', href: tenantDomain ? `/${tenantDomain}/academics/setup` : '/academics/setup', icon: Settings },
        ]
      },

      {
        name: 'Grading Hub',
        icon: Award,
        children: [
          { name: 'Unified Hub', href: tenantDomain ? `/${tenantDomain}/academics/grading-hub` : '/academics/grading-hub', icon: ListChecks },
          { name: 'Assignments', href: tenantDomain ? `/${tenantDomain}/academics/assignments` : '/academics/assignments', icon: BookOpen },
          { name: 'Assessments', href: tenantDomain ? `/${tenantDomain}/academics/assessments` : '/academics/assessments', icon: ClipboardList },
          { name: 'Exams', href: tenantDomain ? `/${tenantDomain}/academics/exams` : '/academics/exams', icon: FileText },
          { name: 'Gradebook', href: tenantDomain ? `/${tenantDomain}/academics/gradebook` : '/academics/gradebook', icon: Award },
          { name: 'Report Cards', href: tenantDomain ? `/${tenantDomain}/academics/report-cards` : '/academics/report-cards', icon: FileText },
        ]
      },

      {
        name: 'Attendance Hub',
        icon: ClipboardList,
        children: [
          { name: 'Mark Attendance', href: tenantDomain ? `/${tenantDomain}/academics/attendance` : '/academics/attendance', icon: ClipboardList },
          { name: 'Attendance Reports', href: tenantDomain ? `/${tenantDomain}/attendance/reports` : '/attendance/reports', icon: FileText },
        ]
      },

      {
        name: 'Personnel',
        icon: Users,
        children: [
          { name: 'Students', href: tenantDomain ? `/${tenantDomain}/students` : '/students', icon: GraduationCap },
          { name: 'Teachers', href: tenantDomain ? `/${tenantDomain}/teachers` : '/teachers', icon: Users },
          { name: 'Teacher Assignments', href: tenantDomain ? `/${tenantDomain}/academics/teacher-assignments` : '/academics/teacher-assignments', icon: UserCheck, requiredPermissions: ['manage_teacher_assignments'] },
        ]
      },

      {
        name: 'Administration',
        icon: UserCheck,
        children: [
          { name: 'Enrollments', href: tenantDomain ? `/${tenantDomain}/academics/enrollments` : '/academics/enrollments', icon: ClipboardList },
          { name: 'Promotion', href: tenantDomain ? `/${tenantDomain}/academics/promotion` : '/academics/promotion', icon: GraduationCap },
          { name: 'Graduation', href: tenantDomain ? `/${tenantDomain}/academics/graduation` : '/academics/graduation', icon: GraduationCap },
          { name: 'Remedial Sessions', href: tenantDomain ? `/${tenantDomain}/academics/remedial` : '/academics/remedial', icon: BookOpen },
        ]
      },

      {
        name: 'Infrastructure',
        icon: Shield,
        children: [
          { name: 'Roles', href: tenantDomain ? `/${tenantDomain}/admin/roles` : '/admin/roles', icon: Shield, requiredPermissions: ['manage_roles'] },
          { name: 'Permissions', href: tenantDomain ? `/${tenantDomain}/admin/permissions` : '/admin/permissions', icon: Shield, requiredPermissions: ['manage_permissions'] },
          { name: 'Role Assignment', href: tenantDomain ? `/${tenantDomain}/admin/role-assignment` : '/admin/role-assignment', icon: UserCheck, requiredPermissions: ['manage_users'] },
          { name: 'Activity Logs', href: tenantDomain ? `/${tenantDomain}/admin/activity-logs` : '/admin/activity-logs', icon: ClipboardList },
          { name: 'General Settings', href: tenantDomain ? `/${tenantDomain}/settings` : '/settings', icon: Settings },
        ]
      },

      { name: 'Communication', href: tenantDomain ? `/${tenantDomain}/communication` : '/communication', icon: MessageSquare },
    ];
  }

  // Teacher Navigation
  if (role === 'teacher') {
    return [
      { name: 'Dashboard', href: tenantDomain ? `/${tenantDomain}/teacher/dashboard` : '/teacher/dashboard', icon: Home },

      {
        name: 'Classroom',
        icon: BookOpen,
        children: [
          { name: 'My Classes', href: tenantDomain ? `/${tenantDomain}/teacher/classes` : '/teacher/classes', icon: BookOpen },
          { name: 'Attendance', href: tenantDomain ? `/${tenantDomain}/teacher/attendance` : '/teacher/attendance', icon: ClipboardList },
          { name: 'Timetable', href: tenantDomain ? `/${tenantDomain}/academics/timetables` : '/academics/timetables', icon: Calendar },
        ]
      },

      {
        name: 'Grading Hub',
        icon: Award,
        children: [
          { name: 'Grading Workspace', href: tenantDomain ? `/${tenantDomain}/academics/grading-hub` : '/academics/grading-hub', icon: ListChecks },
          { name: 'Manage Assignments', href: tenantDomain ? `/${tenantDomain}/academics/assignments` : '/academics/assignments', icon: BookOpen },
          { name: 'Assessments', href: tenantDomain ? `/${tenantDomain}/academics/assessments` : '/academics/assessments', icon: ClipboardList },
        ]
      },

      { name: 'Communication', href: tenantDomain ? `/${tenantDomain}/teacher/communication` : '/teacher/communication', icon: MessageSquare },
    ];
  }

  // Student Navigation
  if (role === 'student') {
    return [
      { name: 'Dashboard', href: tenantDomain ? `/${tenantDomain}/student/dashboard` : '/student/dashboard', icon: Home },

      {
        name: 'My Learning',
        icon: BookOpen,
        children: [
          { name: 'My Courses', href: tenantDomain ? `/${tenantDomain}/student/courses` : '/student/courses', icon: BookOpen },
          { name: 'Timetable', href: tenantDomain ? `/${tenantDomain}/student/timetable` : '/student/timetable', icon: Calendar },
          { name: 'My Attendance', href: tenantDomain ? `/${tenantDomain}/student/attendance` : '/student/attendance', icon: ClipboardList },
        ]
      },

      {
        name: 'Learning Results',
        icon: Award,
        children: [
          { name: 'My Assignments', href: tenantDomain ? `/${tenantDomain}/academics/assignments` : '/academics/assignments', icon: BookOpen },
          { name: 'Assessments', href: tenantDomain ? `/${tenantDomain}/academics/assessments` : '/academics/assessments', icon: ClipboardList },
          { name: 'Exam Results', href: tenantDomain ? `/${tenantDomain}/student/exams` : '/student/exams', icon: FileText },
          { name: 'Grade History', href: tenantDomain ? `/${tenantDomain}/student/grades` : '/student/grades', icon: Award },
        ]
      },

      { name: 'Communication', href: tenantDomain ? `/${tenantDomain}/student/communication` : '/student/communication', icon: MessageSquare },
    ];
  }

  // Fallback for unknown roles - minimal navigation
  return [
    { name: 'Dashboard', href: tenantDomain ? `/${tenantDomain}/dashboard` : '/dashboard', icon: Home },
  ];
};

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { tenant } = useTenant();

  // Helper function to check if user has required permissions
  const hasPermissions = (requiredPermissions?: string[]): boolean => {
    // Development mode bypass for easier local testing
    if (process.env.NEXT_PUBLIC_APP_ENV === 'development') {
      return true;
    }

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    if (!user || !user.permissions) {
      return false; // No user or permissions
    }

    // Check if user has all required permissions
    return requiredPermissions.every(permission =>
      user.permissions.includes(permission)
    );
  };

  // Filter navigation items based on permissions
  const filterNavigationByPermissions = (items: MenuItem[]): MenuItem[] => {
    return items.map(item => {
      if (item.children) {
        // Filter children based on permissions
        const filteredChildren = item.children.filter(child =>
          hasPermissions(child.requiredPermissions)
        );

        // Only include parent if it has visible children or no permission requirements
        if (filteredChildren.length > 0 || hasPermissions(item.requiredPermissions)) {
          return { ...item, children: filteredChildren };
        }
        return null;
      } else {
        // Check permissions for single items
        return hasPermissions(item.requiredPermissions) ? item : null;
      }
    }).filter((item): item is MenuItem => item !== null);
  };
  // Initialize open sections based on user role
  const getInitialOpenSections = (role: string): string[] => {
    switch (role) {
      case 'admin':
        return ['Academic Core', 'Personnel', 'Administration', 'Grading Hub', 'Attendance Hub', 'Infrastructure'];
      case 'teacher':
        return ['Classroom', 'Grading Hub'];
      case 'student':
        return ['My Learning', 'Grading Hub'];
      default:
        return [];
    }
  };

  const [openSections, setOpenSections] = useState<string[]>(getInitialOpenSections(user?.role || ''));

  // Extract tenant domain from current path instead of relying on tenant.domain
  const tenantDomain = getTenantDomainFromPath(pathname) || tenant?.domain;
  const rawNavigation = getNavigation(user?.role || '', tenantDomain || undefined);
  const navigation = filterNavigationByPermissions(rawNavigation);

  const toggleSection = (sectionName: string) => {
    setOpenSections(prev =>
      prev.includes(sectionName)
        ? prev.filter(name => name !== sectionName)
        : [...prev, sectionName]
    );
  };

  const isPathActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const isSectionActive = (item: MenuItem) => {
    if (item.href) {
      return isPathActive(item.href);
    }
    if (item.children) {
      return item.children.some(child => child.href && isPathActive(child.href));
    }
    return false;
  };

  const renderMenuItem = (item: MenuItem) => {
    const Icon = item.icon;
    const isActive = isSectionActive(item);
    const isOpen = openSections.includes(item.name);

    if (item.children) {
      return (
        <div key={item.name} className="relative">
          <Collapsible open={isOpen} onOpenChange={() => toggleSection(item.name)}>
            <CollapsibleTrigger asChild>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-between mb-1 relative z-10",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
                )}
                style={!isActive ? {
                  '--hover-bg': tenant?.primaryColor ? `${tenant.primaryColor}20` : undefined
                } as React.CSSProperties : undefined}
                onMouseEnter={(e) => {
                  if (!isActive && tenant?.primaryColor) {
                    e.currentTarget.style.backgroundColor = `${tenant.primaryColor}20`;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = '';
                  }
                }}
              >
                <div className="flex items-center">
                  <Icon className="mr-2 h-4 w-4" />
                  {item.name}
                </div>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 relative">
              {item.children.map((child) => {
                const ChildIcon = child.icon;
                const isChildActive = child.href ? isPathActive(child.href) : false;
                return (
                  <div key={child.name} className="relative">
                    <Link
                      href={child.href || '#'}
                      className="no-underline block"
                    >
                      <Button
                        variant={isChildActive ? "secondary" : "ghost"}
                        className={cn(
                          "w-full justify-start mb-1 ml-4 relative z-10",
                          isChildActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
                        )}
                        onMouseEnter={(e) => {
                          if (!isChildActive && tenant?.primaryColor) {
                            e.currentTarget.style.backgroundColor = `${tenant.primaryColor}20`;
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isChildActive) {
                            e.currentTarget.style.backgroundColor = '';
                          }
                        }}
                      >
                        <ChildIcon className="mr-2 h-4 w-4" />
                        {child.name}
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    }

    return (
      <div key={item.name} className="relative">
        <Link
          href={item.href || '#'}
          className="no-underline block"
        >
          <Button
            variant={isActive ? "secondary" : "ghost"}
            className={cn(
              "w-full justify-start mb-1 relative z-10",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
            )}
            onMouseEnter={(e) => {
              if (!isActive && tenant?.primaryColor) {
                e.currentTarget.style.backgroundColor = `${tenant.primaryColor}20`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = '';
              }
            }}
          >
            <Icon className="mr-2 h-4 w-4" />
            {item.name}
          </Button>
        </Link>
      </div>
    );
  };

  return (
    <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
        <div className="flex items-center h-16 flex-shrink-0 px-4 border-b border-sidebar-border">
          {tenant?.logo ? (
            <div className="flex items-center gap-2">
              <Image
                src={tenant.logo}
                alt={tenant?.name || 'School Logo'}
                width={32}
                height={32}
                className="h-8 w-8 rounded object-contain"
              />
              <span className="text-lg font-semibold truncate">
                {tenant.name || 'School Portal'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-md"
                style={{ backgroundColor: tenant?.primaryColor ? `${tenant.primaryColor}1A` : undefined }}
              >
                <School
                  className="h-5 w-5"
                  style={{ color: tenant?.primaryColor || undefined }}
                />
              </div>
              <span className="text-lg font-semibold truncate text-black">
                {(() => {
                  // 1. Try tenant name directly
                  if (tenant?.name && tenant.name.trim() && tenant.name.toLowerCase() !== 'loading...') {
                    return tenant.name;
                  }

                  // 2. Try extraction from domain/subdomain/path
                  const sub = tenant?.domain ||
                    tenant?.subdomain ||
                    getTenantDomainFromPath(pathname) ||
                    extractTenantSubdomain() ||
                    (typeof window !== 'undefined' ? localStorage.getItem('currentTenantSubdomain') : '');

                  // 3. Validate and format fallback
                  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
                  if (sub && !uuidRe.test(sub) && sub.toLowerCase() !== 'unknown') {
                    const formatted = sub.replace(/[._-]+/g, ' ').trim();
                    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
                  }

                  // 4. Final fallback
                  return 'School Portal';
                })()}
              </span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col overflow-y-auto pt-5 pb-4">
          <nav className="flex-1 px-3 space-y-1">
            {navigation.map(renderMenuItem)}
          </nav>
        </div>
        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center">
            <div className="h-9 w-9 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-semibold">
              {user?.firstName?.charAt(0)}{user?.lastName?.charAt(0)}
            </div>
            <div className="ml-3 flex-1">
              <p className="text-sm font-medium">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-sidebar-foreground/70">
                {user?.role}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => logout()} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
