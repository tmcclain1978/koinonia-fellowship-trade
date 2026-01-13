import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, GripVertical, ChevronRight, ChevronDown, BookOpen, Layers, FileText, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import QuizEditor from "./QuizEditor";

interface Course {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  difficulty_level: string;
  estimated_duration: string | null;
  status: string;
  order_index: number | null;
}

interface Module {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  order_index: number | null;
  status: string;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration: string | null;
  content_markdown: string | null;
  quiz_questions: any | null;
  order_index: number | null;
  status: string;
}

const AcademyManager = () => {
  const { toast } = useToast();
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  
  // Dialog states
  const [isCourseDialogOpen, setIsCourseDialogOpen] = useState(false);
  const [isModuleDialogOpen, setIsModuleDialogOpen] = useState(false);
  const [isLessonDialogOpen, setIsLessonDialogOpen] = useState(false);
  
  // Editing states
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  
  // Parent references for creating new items
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  
  // Quiz questions state for lesson editor
  const [lessonQuizQuestions, setLessonQuizQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [coursesRes, modulesRes, lessonsRes] = await Promise.all([
        supabase.from("courses").select("*").order("order_index"),
        supabase.from("course_modules").select("*").order("order_index"),
        supabase.from("course_lessons").select("*").order("order_index")
      ]);

      if (coursesRes.error) throw coursesRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (lessonsRes.error) throw lessonsRes.error;

      setCourses(coursesRes.data || []);
      setModules(modulesRes.data || []);
      setLessons(lessonsRes.data || []);
    } catch (error) {
      console.error("Error fetching academy data:", error);
      toast({
        title: "Error",
        description: "Failed to fetch academy data",
        variant: "destructive",
      });
    }
  };

  const toggleCourse = (courseId: string) => {
    setExpandedCourses(prev => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  };

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  // Course CRUD
  const saveCourse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const courseData = {
        title: formData.get("title") as string,
        description: formData.get("description") as string,
        thumbnail_url: formData.get("thumbnail_url") as string || null,
        difficulty_level: formData.get("difficulty_level") as string,
        estimated_duration: formData.get("estimated_duration") as string || null,
        status: formData.get("status") as string,
        order_index: editingCourse?.order_index ?? courses.length,
      };

      if (editingCourse) {
        const { error } = await supabase
          .from("courses")
          .update(courseData)
          .eq("id", editingCourse.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("courses")
          .insert([courseData]);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Course ${editingCourse ? "updated" : "created"} successfully`,
      });
      
      setIsCourseDialogOpen(false);
      setEditingCourse(null);
      fetchData();
    } catch (error) {
      console.error("Error saving course:", error);
      toast({
        title: "Error",
        description: "Failed to save course",
        variant: "destructive",
      });
    }
  };

  const deleteCourse = async (id: string) => {
    if (!confirm("Are you sure? This will delete all modules and lessons in this course.")) return;
    
    try {
      // Delete all lessons in all modules of this course
      const courseModules = modules.filter(m => m.course_id === id);
      for (const module of courseModules) {
        await supabase.from("course_lessons").delete().eq("module_id", module.id);
      }
      // Delete all modules
      await supabase.from("course_modules").delete().eq("course_id", id);
      // Delete course
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;

      toast({ title: "Success", description: "Course deleted successfully" });
      fetchData();
    } catch (error) {
      console.error("Error deleting course:", error);
      toast({ title: "Error", description: "Failed to delete course", variant: "destructive" });
    }
  };

  // Module CRUD
  const saveModule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const courseModules = modules.filter(m => m.course_id === selectedCourseId);
      const moduleData = {
        course_id: editingModule?.course_id || selectedCourseId!,
        title: formData.get("title") as string,
        description: formData.get("description") as string || null,
        status: formData.get("status") as string,
        order_index: editingModule?.order_index ?? courseModules.length,
      };

      if (editingModule) {
        const { error } = await supabase
          .from("course_modules")
          .update(moduleData)
          .eq("id", editingModule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("course_modules")
          .insert([moduleData]);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Module ${editingModule ? "updated" : "created"} successfully`,
      });
      
      setIsModuleDialogOpen(false);
      setEditingModule(null);
      setSelectedCourseId(null);
      fetchData();
    } catch (error) {
      console.error("Error saving module:", error);
      toast({ title: "Error", description: "Failed to save module", variant: "destructive" });
    }
  };

  const deleteModule = async (id: string) => {
    if (!confirm("Are you sure? This will delete all lessons in this module.")) return;
    
    try {
      await supabase.from("course_lessons").delete().eq("module_id", id);
      const { error } = await supabase.from("course_modules").delete().eq("id", id);
      if (error) throw error;

      toast({ title: "Success", description: "Module deleted successfully" });
      fetchData();
    } catch (error) {
      console.error("Error deleting module:", error);
      toast({ title: "Error", description: "Failed to delete module", variant: "destructive" });
    }
  };

  // Lesson CRUD
  const saveLesson = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    
    try {
      const moduleLessons = lessons.filter(l => l.module_id === selectedModuleId);
      
      // Only include quiz_questions if there are valid questions
      const validQuizQuestions = lessonQuizQuestions.filter(q => 
        q.question.trim() && q.options.some((o: string) => o.trim())
      );
      
      const lessonData = {
        module_id: editingLesson?.module_id || selectedModuleId!,
        title: formData.get("title") as string,
        description: formData.get("description") as string || null,
        video_url: formData.get("video_url") as string || null,
        thumbnail_url: formData.get("thumbnail_url") as string || null,
        duration: formData.get("duration") as string || null,
        content_markdown: formData.get("content_markdown") as string || null,
        quiz_questions: validQuizQuestions.length > 0 ? validQuizQuestions : null,
        status: formData.get("status") as string,
        order_index: editingLesson?.order_index ?? moduleLessons.length,
      };

      if (editingLesson) {
        const { error } = await supabase
          .from("course_lessons")
          .update(lessonData)
          .eq("id", editingLesson.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("course_lessons")
          .insert([lessonData]);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Lesson ${editingLesson ? "updated" : "created"} successfully`,
      });
      
      setIsLessonDialogOpen(false);
      setEditingLesson(null);
      setSelectedModuleId(null);
      setLessonQuizQuestions([]);
      fetchData();
    } catch (error) {
      console.error("Error saving lesson:", error);
      toast({ title: "Error", description: "Failed to save lesson", variant: "destructive" });
    }
  };

  const deleteLesson = async (id: string) => {
    if (!confirm("Are you sure you want to delete this lesson?")) return;
    
    try {
      const { error } = await supabase.from("course_lessons").delete().eq("id", id);
      if (error) throw error;

      toast({ title: "Success", description: "Lesson deleted successfully" });
      fetchData();
    } catch (error) {
      console.error("Error deleting lesson:", error);
      toast({ title: "Error", description: "Failed to delete lesson", variant: "destructive" });
    }
  };

  // Reordering functions
  const reorderItem = async (
    type: 'course' | 'module' | 'lesson',
    id: string,
    direction: 'up' | 'down'
  ) => {
    try {
      let items: any[];
      let tableName: string;
      let parentKey: string | null = null;
      let parentId: string | null = null;

      if (type === 'course') {
        items = [...courses].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        tableName = 'courses';
      } else if (type === 'module') {
        const module = modules.find(m => m.id === id);
        if (!module) return;
        parentId = module.course_id;
        items = modules
          .filter(m => m.course_id === parentId)
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        tableName = 'course_modules';
        parentKey = 'course_id';
      } else {
        const lesson = lessons.find(l => l.id === id);
        if (!lesson) return;
        parentId = lesson.module_id;
        items = lessons
          .filter(l => l.module_id === parentId)
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
        tableName = 'course_lessons';
        parentKey = 'module_id';
      }

      const currentIndex = items.findIndex(item => item.id === id);
      if (currentIndex === -1) return;
      
      const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;

      // Swap the items
      const currentItem = items[currentIndex];
      const targetItem = items[targetIndex];

      await Promise.all([
        supabase.from(tableName as any).update({ order_index: targetIndex }).eq("id", currentItem.id),
        supabase.from(tableName as any).update({ order_index: currentIndex }).eq("id", targetItem.id),
      ]);

      fetchData();
    } catch (error) {
      console.error("Error reordering:", error);
      toast({ title: "Error", description: "Failed to reorder items", variant: "destructive" });
    }
  };

  const getModulesForCourse = (courseId: string) => 
    modules.filter(m => m.course_id === courseId).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const getLessonsForModule = (moduleId: string) => 
    lessons.filter(l => l.module_id === moduleId).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

  const getDifficultyColor = (level: string) => {
    switch (level) {
      case 'beginner': return 'bg-green-500/20 text-green-500';
      case 'intermediate': return 'bg-yellow-500/20 text-yellow-500';
      case 'advanced': return 'bg-orange-500/20 text-orange-500';
      case 'expert': return 'bg-red-500/20 text-red-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Academy Content Management
          </CardTitle>
          <CardDescription>
            Create and manage courses, modules, and lessons. Drag to reorder.
          </CardDescription>
        </div>
        <Dialog open={isCourseDialogOpen} onOpenChange={setIsCourseDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingCourse(null)}>
              <Plus className="mr-2 h-4 w-4" />
              New Course
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={saveCourse}>
              <DialogHeader>
                <DialogTitle>{editingCourse ? "Edit" : "Create"} Course</DialogTitle>
                <DialogDescription>
                  {editingCourse ? "Update course details" : "Create a new course"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" defaultValue={editingCourse?.title} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" defaultValue={editingCourse?.description ?? ''} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="thumbnail_url">Thumbnail URL</Label>
                  <Input id="thumbnail_url" name="thumbnail_url" type="url" defaultValue={editingCourse?.thumbnail_url ?? ''} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="difficulty_level">Difficulty Level</Label>
                    <Select name="difficulty_level" defaultValue={editingCourse?.difficulty_level || "beginner"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="expert">Expert</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="estimated_duration">Estimated Duration</Label>
                    <Input id="estimated_duration" name="estimated_duration" placeholder="4 hours" defaultValue={editingCourse?.estimated_duration ?? ''} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue={editingCourse?.status || "draft"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingCourse ? "Update" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {/* Module Dialog */}
        <Dialog open={isModuleDialogOpen} onOpenChange={setIsModuleDialogOpen}>
          <DialogContent className="max-w-xl">
            <form onSubmit={saveModule}>
              <DialogHeader>
                <DialogTitle>{editingModule ? "Edit" : "Create"} Module</DialogTitle>
                <DialogDescription>
                  {editingModule ? "Update module details" : "Create a new module"}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" defaultValue={editingModule?.title} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea id="description" name="description" defaultValue={editingModule?.description ?? ''} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  <Select name="status" defaultValue={editingModule?.status || "draft"}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">{editingModule ? "Update" : "Create"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Lesson Dialog */}
        <Dialog 
          open={isLessonDialogOpen} 
          onOpenChange={(open) => {
            setIsLessonDialogOpen(open);
            if (!open) {
              setLessonQuizQuestions([]);
              setEditingLesson(null);
              setSelectedModuleId(null);
            }
          }}
        >
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={saveLesson}>
              <DialogHeader>
                <DialogTitle>{editingLesson ? "Edit" : "Create"} Lesson</DialogTitle>
                <DialogDescription>
                  {editingLesson ? "Update lesson details and quiz questions" : "Create a new lesson with optional quiz"}
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="details" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="details">Lesson Details</TabsTrigger>
                  <TabsTrigger value="quiz">
                    Quiz Questions
                    {lessonQuizQuestions.length > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {lessonQuizQuestions.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
                
                <TabsContent value="details" className="space-y-4 mt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" name="title" defaultValue={editingLesson?.title} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" name="description" defaultValue={editingLesson?.description ?? ''} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="video_url">Video URL</Label>
                      <Input id="video_url" name="video_url" type="url" placeholder="https://youtube.com/..." defaultValue={editingLesson?.video_url ?? ''} />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="duration">Duration</Label>
                      <Input id="duration" name="duration" placeholder="15 min" defaultValue={editingLesson?.duration ?? ''} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="thumbnail_url">Thumbnail URL</Label>
                    <Input id="thumbnail_url" name="thumbnail_url" type="url" defaultValue={editingLesson?.thumbnail_url ?? ''} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="content_markdown">Content (Markdown)</Label>
                    <Textarea 
                      id="content_markdown" 
                      name="content_markdown" 
                      className="min-h-[200px] font-mono text-sm"
                      defaultValue={editingLesson?.content_markdown ?? ''} 
                      placeholder="## Lesson Content&#10;&#10;Write your lesson content in Markdown format..."
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="status">Status</Label>
                    <Select name="status" defaultValue={editingLesson?.status || "draft"}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </TabsContent>
                
                <TabsContent value="quiz" className="mt-4">
                  <QuizEditor 
                    questions={lessonQuizQuestions} 
                    onChange={setLessonQuizQuestions} 
                  />
                </TabsContent>
              </Tabs>
              
              <Separator className="my-4" />
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsLessonDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">{editingLesson ? "Update" : "Create"} Lesson</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Course List */}
        {courses.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No courses yet</p>
            <p className="text-sm">Create your first course to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {courses
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((course, courseIndex) => (
              <Collapsible 
                key={course.id} 
                open={expandedCourses.has(course.id)}
                onOpenChange={() => toggleCourse(course.id)}
              >
                <div className="border rounded-lg overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center gap-3 p-4 bg-card hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderItem('course', course.id, 'up');
                          }}
                          disabled={courseIndex === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            reorderItem('course', course.id, 'down');
                          }}
                          disabled={courseIndex === courses.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                      
                      {expandedCourses.has(course.id) ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      
                      <BookOpen className="h-5 w-5 text-primary" />
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{course.title}</span>
                          <Badge className={getDifficultyColor(course.difficulty_level)}>
                            {course.difficulty_level}
                          </Badge>
                          <Badge variant={course.status === 'published' ? 'default' : 'secondary'}>
                            {course.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getModulesForCourse(course.id).length} modules • {course.estimated_duration || 'N/A'}
                        </p>
                      </div>
                      
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCourseId(course.id);
                            setEditingModule(null);
                            setIsModuleDialogOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Module
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingCourse(course);
                            setIsCourseDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteCourse(course.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent>
                    <div className="border-t bg-muted/20">
                      {getModulesForCourse(course.id).length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No modules yet. Add a module to get started.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {getModulesForCourse(course.id).map((module, moduleIndex, moduleArray) => (
                            <Collapsible
                              key={module.id}
                              open={expandedModules.has(module.id)}
                              onOpenChange={() => toggleModule(module.id)}
                            >
                              <CollapsibleTrigger asChild>
                                <div className="flex items-center gap-3 p-3 pl-8 hover:bg-muted/50 cursor-pointer">
                                  <div className="flex items-center gap-1 text-muted-foreground">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        reorderItem('module', module.id, 'up');
                                      }}
                                      disabled={moduleIndex === 0}
                                    >
                                      <ArrowUp className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        reorderItem('module', module.id, 'down');
                                      }}
                                      disabled={moduleIndex === moduleArray.length - 1}
                                    >
                                      <ArrowDown className="h-3 w-3" />
                                    </Button>
                                  </div>
                                  
                                  {expandedModules.has(module.id) ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                  
                                  <Layers className="h-4 w-4 text-orange-500" />
                                  
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium">{module.title}</span>
                                      <Badge variant={module.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                                        {module.status}
                                      </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {getLessonsForModule(module.id).length} lessons
                                    </p>
                                  </div>
                                  
                                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => {
                                        setSelectedModuleId(module.id);
                                        setEditingLesson(null);
                                        setLessonQuizQuestions([]);
                                        setIsLessonDialogOpen(true);
                                      }}
                                    >
                                      <Plus className="h-3 w-3 mr-1" />
                                      Lesson
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => {
                                        setSelectedCourseId(course.id);
                                        setEditingModule(module);
                                        setIsModuleDialogOpen(true);
                                      }}
                                    >
                                      <Edit className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => deleteModule(module.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent>
                                <div className="bg-muted/30">
                                  {getLessonsForModule(module.id).length === 0 ? (
                                    <div className="p-3 pl-16 text-center text-muted-foreground text-xs">
                                      No lessons yet. Add a lesson to this module.
                                    </div>
                                  ) : (
                                    <div className="divide-y divide-border/50">
                                      {getLessonsForModule(module.id).map((lesson, lessonIndex, lessonArray) => (
                                        <div key={lesson.id} className="flex items-center gap-3 p-2 pl-16 hover:bg-muted/50">
                                          <div className="flex items-center gap-1 text-muted-foreground">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5"
                                              onClick={() => reorderItem('lesson', lesson.id, 'up')}
                                              disabled={lessonIndex === 0}
                                            >
                                              <ArrowUp className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-5 w-5"
                                              onClick={() => reorderItem('lesson', lesson.id, 'down')}
                                              disabled={lessonIndex === lessonArray.length - 1}
                                            >
                                              <ArrowDown className="h-3 w-3" />
                                            </Button>
                                          </div>
                                          
                                          <FileText className="h-4 w-4 text-blue-500" />
                                          
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                              <span className="text-sm">{lesson.title}</span>
                                              {lesson.video_url && (
                                                <Badge variant="outline" className="text-xs">Video</Badge>
                                              )}
                                              {lesson.quiz_questions && (
                                                <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-500 border-purple-500/30">Quiz</Badge>
                                              )}
                                              <Badge variant={lesson.status === 'published' ? 'default' : 'secondary'} className="text-xs">
                                                {lesson.status}
                                              </Badge>
                                            </div>
                                            {lesson.duration && (
                                              <p className="text-xs text-muted-foreground">{lesson.duration}</p>
                                            )}
                                          </div>
                                          
                                          <div className="flex gap-1">
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={() => {
                                                setSelectedModuleId(module.id);
                                                setEditingLesson(lesson);
                                                // Parse existing quiz questions
                                                const existingQuiz = lesson.quiz_questions;
                                                if (Array.isArray(existingQuiz)) {
                                                  setLessonQuizQuestions(existingQuiz);
                                                } else {
                                                  setLessonQuizQuestions([]);
                                                }
                                                setIsLessonDialogOpen(true);
                                              }}
                                            >
                                              <Edit className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-6 w-6"
                                              onClick={() => deleteLesson(lesson.id)}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        )}

        {/* Summary Stats */}
        <div className="mt-6 pt-6 border-t flex gap-6 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            <span>{courses.length} Courses</span>
          </div>
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            <span>{modules.length} Modules</span>
          </div>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span>{lessons.length} Lessons</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-green-500">{courses.filter(c => c.status === 'published').length} Published</span>
            <span>•</span>
            <span className="text-yellow-500">{courses.filter(c => c.status === 'draft').length} Drafts</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AcademyManager;
