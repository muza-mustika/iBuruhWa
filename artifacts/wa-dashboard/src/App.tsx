import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Sessions from "@/pages/sessions";
import Rules from "@/pages/rules";
import Messages from "@/pages/messages";
import Send from "@/pages/send";
import Broadcast from "@/pages/broadcast";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { loadSettings, applySettings } from "@/lib/settings";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 5000, refetchInterval: 5000, retry: 1 } },
});

function AppRoutes() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/sessions" component={Sessions} />
        <Route path="/rules" component={Rules} />
        <Route path="/messages" component={Messages} />
        <Route path="/send" component={Send} />
        <Route path="/broadcast" component={Broadcast} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    applySettings(loadSettings());
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRoutes />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
