import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Trading from "./pages/Trading";
import PaperTrading from "./pages/PaperTrading";
import TradingJournal from "./pages/TradingJournal";
import Analytics from "./pages/Analytics";
import AdvancedAnalytics from "./pages/AdvancedAnalytics";
import Education from "./pages/Education";
import Academy from "./pages/Academy";
import CourseDetail from "./pages/CourseDetail";
import LessonPlayer from "./pages/LessonPlayer";
import Podcast from "./pages/Podcast";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import Help from "./pages/Help";
import PendingApproval from "./pages/PendingApproval";
import Pricing from "./pages/Pricing";
import TradingBot from "./pages/TradingBot";
import BotLearning from "./pages/BotLearning";
import BotTesting from "./pages/BotTesting";
import PocketOption from "./pages/PocketOption";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppErrorBoundary>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/trading" element={<Trading />} />
            <Route path="/paper-trading" element={<PaperTrading />} />
            <Route path="/trading-journal" element={<TradingJournal />} />
            <Route path="/trading-bot" element={<TradingBot />} />
            <Route path="/bot-learning" element={<BotLearning />} />
            <Route path="/bot-testing" element={<BotTesting />} />
            <Route path="/pocketoption" element={<PocketOption />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/advanced-analytics" element={<AdvancedAnalytics />} />
            <Route path="/education" element={<Education />} />
            <Route path="/academy" element={<Academy />} />
            <Route path="/academy/course/:courseId" element={<CourseDetail />} />
            <Route path="/academy/lesson/:lessonId" element={<LessonPlayer />} />
            <Route path="/podcast" element={<Podcast />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/help" element={<Help />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

