import { LayoutDashboard, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "./ui/sidebar";
import profitFinderLogo from "../../profit_finder_logo.png";

type AppSidebarProps = {
  selectedView: string;
  onViewChange: (view: string) => void;
};

export function AppSidebar({ selectedView, onViewChange }: AppSidebarProps) {
  const navigationItems = [
    {
      id: "products",
      label: "Products",
      icon: LayoutDashboard,
    },
    {
      id: "connections",
      label: "Connections",
      icon: Settings,
    },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <img 
            src={profitFinderLogo} 
            alt="Profit Finder Logo" 
            className="h-6 w-6"
          />
          <span className="font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            Profit Finder
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => {
                const Icon = item.icon;
                const isActive = selectedView === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => onViewChange(item.id)}
                      isActive={isActive}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
