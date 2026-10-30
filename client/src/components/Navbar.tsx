import { Link, useLocation } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { Separator } from '@/components/ui/separator.tsx';
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu.tsx';
import { cn } from '@/lib/utils.ts';
import { ModeToggle } from '@/components/mode-toggle.tsx';

const links = [
  { to: '/',          label: 'This Week'     },
  { to: '/track',     label: 'Track Record'  },
  { to: '/transfers', label: 'Players'       },
  { to: '/chips',     label: 'Chips'         },
  { to: '/squad',     label: 'Squad Builder' },
];

export function Navbar() {
  const { pathname } = useLocation();
  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-foreground">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Activity className="size-4" />
          </span>
          <span className="hidden sm:inline">FPL Planner</span>
        </Link>
        <Separator orientation="vertical" className="mx-1 h-5" />
        {/* Only the links scroll sideways on small screens; the theme toggle stays put. */}
        <div className="min-w-0 flex-1 overflow-x-auto">
        <NavigationMenu className="max-w-none justify-start">
          <NavigationMenuList>
          {links.map((l) => (
            <NavigationMenuItem key={l.to}>
              <NavigationMenuLink
                render={<Link to={l.to} />}
                active={pathname === l.to}
                className={cn(
                  navigationMenuTriggerStyle(),
                  'text-muted-foreground',
                  pathname === l.to && 'bg-accent text-accent-foreground'
                )}
              >
                {l.label}
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
          </NavigationMenuList>
        </NavigationMenu>
        </div>
        <div className="shrink-0">
          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
