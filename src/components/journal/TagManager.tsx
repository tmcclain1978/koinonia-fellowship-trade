import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tag, Edit2, Trash2, GitMerge, Search, X, Check, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JournalEntry {
  id: string;
  tags: string[] | null;
}

interface TagManagerProps {
  isOpen: boolean;
  onClose: () => void;
  entries: JournalEntry[];
  onUpdateTags: (updates: { entryId: string; tags: string[] }[]) => Promise<void>;
}

const TagManager = ({ isOpen, onClose, entries, onUpdateTags }: TagManagerProps) => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [mergeTargetTag, setMergeTargetTag] = useState("");
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get all tags with their usage counts
  const tagStats = useMemo(() => {
    const stats: Record<string, { count: number; entryIds: string[] }> = {};
    
    entries.forEach(entry => {
      entry.tags?.forEach(tag => {
        if (!stats[tag]) {
          stats[tag] = { count: 0, entryIds: [] };
        }
        stats[tag].count++;
        stats[tag].entryIds.push(entry.id);
      });
    });

    return Object.entries(stats)
      .map(([tag, data]) => ({ tag, ...data }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const filteredTags = useMemo(() => {
    if (!searchQuery.trim()) return tagStats;
    const query = searchQuery.toLowerCase();
    return tagStats.filter(t => t.tag.toLowerCase().includes(query));
  }, [tagStats, searchQuery]);

  const toggleTagSelection = (tag: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedTags(newSelected);
  };

  const selectAll = () => {
    setSelectedTags(new Set(filteredTags.map(t => t.tag)));
  };

  const deselectAll = () => {
    setSelectedTags(new Set());
  };

  const startEditing = (tag: string) => {
    setEditingTag(tag);
    setEditValue(tag);
  };

  const cancelEditing = () => {
    setEditingTag(null);
    setEditValue("");
  };

  const saveRename = async () => {
    if (!editingTag || !editValue.trim()) return;
    
    const newTag = editValue.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (newTag === editingTag) {
      cancelEditing();
      return;
    }

    // Check if new tag already exists
    if (tagStats.some(t => t.tag === newTag)) {
      toast({
        title: "Tag already exists",
        description: `The tag "${newTag}" already exists. Use merge instead.`,
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const tagData = tagStats.find(t => t.tag === editingTag);
      if (!tagData) return;

      const updates = tagData.entryIds.map(entryId => {
        const entry = entries.find(e => e.id === entryId);
        const newTags = entry?.tags?.map(t => t === editingTag ? newTag : t) || [];
        return { entryId, tags: newTags };
      });

      await onUpdateTags(updates);
      
      toast({
        title: "Tag renamed",
        description: `Renamed "${editingTag}" to "${newTag}" in ${updates.length} entries`,
      });
      
      cancelEditing();
    } catch (error: any) {
      toast({
        title: "Error renaming tag",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMerge = async () => {
    if (selectedTags.size < 2 || !mergeTargetTag.trim()) return;

    const targetTag = mergeTargetTag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    
    setIsProcessing(true);
    try {
      const affectedEntryIds = new Set<string>();
      selectedTags.forEach(tag => {
        const tagData = tagStats.find(t => t.tag === tag);
        tagData?.entryIds.forEach(id => affectedEntryIds.add(id));
      });

      const updates = Array.from(affectedEntryIds).map(entryId => {
        const entry = entries.find(e => e.id === entryId);
        const currentTags = entry?.tags || [];
        
        // Remove selected tags and add target tag (avoiding duplicates)
        const newTags = currentTags.filter(t => !selectedTags.has(t));
        if (!newTags.includes(targetTag)) {
          newTags.push(targetTag);
        }
        
        return { entryId, tags: newTags };
      });

      await onUpdateTags(updates);
      
      toast({
        title: "Tags merged",
        description: `Merged ${selectedTags.size} tags into "${targetTag}" across ${updates.length} entries`,
      });
      
      setShowMergeDialog(false);
      setSelectedTags(new Set());
      setMergeTargetTag("");
    } catch (error: any) {
      toast({
        title: "Error merging tags",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async () => {
    if (selectedTags.size === 0) return;

    setIsProcessing(true);
    try {
      const affectedEntryIds = new Set<string>();
      selectedTags.forEach(tag => {
        const tagData = tagStats.find(t => t.tag === tag);
        tagData?.entryIds.forEach(id => affectedEntryIds.add(id));
      });

      const updates = Array.from(affectedEntryIds).map(entryId => {
        const entry = entries.find(e => e.id === entryId);
        const newTags = (entry?.tags || []).filter(t => !selectedTags.has(t));
        return { entryId, tags: newTags };
      });

      await onUpdateTags(updates);
      
      toast({
        title: "Tags deleted",
        description: `Deleted ${selectedTags.size} tag(s) from ${updates.length} entries`,
      });
      
      setShowDeleteDialog(false);
      setSelectedTags(new Set());
    } catch (error: any) {
      toast({
        title: "Error deleting tags",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              Tag Manager
            </DialogTitle>
            <DialogDescription>
              Manage your journal tags. Rename, merge, or delete tags across all entries.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Search and Actions */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={selectedTags.size === filteredTags.length ? deselectAll : selectAll}
                >
                  {selectedTags.size === filteredTags.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>
            </div>

            {/* Selected Actions */}
            {selectedTags.size > 0 && (
              <div className="flex items-center gap-2 mb-4 p-3 bg-muted/30 rounded-lg">
                <span className="text-sm font-medium">{selectedTags.size} selected</span>
                <div className="flex-1" />
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowMergeDialog(true)}
                  disabled={selectedTags.size < 2}
                  className="gap-1"
                >
                  <GitMerge className="w-4 h-4" />
                  Merge
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setShowDeleteDialog(true)}
                  className="gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            )}

            {/* Tags List */}
            <div className="flex-1 overflow-y-auto border border-border rounded-lg">
              {tagStats.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Tag className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No tags found.</p>
                  <p className="text-sm mt-1">Start adding tags to your journal entries.</p>
                </div>
              ) : filteredTags.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No tags match "{searchQuery}"</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredTags.map(({ tag, count }) => (
                    <div 
                      key={tag} 
                      className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors"
                    >
                      <Checkbox
                        checked={selectedTags.has(tag)}
                        onCheckedChange={() => toggleTagSelection(tag)}
                      />
                      
                      {editingTag === tag ? (
                        <div className="flex-1 flex items-center gap-2">
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8 flex-1"
                            autoFocus
                          />
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            onClick={saveRename}
                            disabled={isProcessing}
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            onClick={cancelEditing}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Badge variant="outline" className="text-sm">
                            #{tag}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {count} {count === 1 ? 'entry' : 'entries'}
                          </span>
                          <div className="flex-1" />
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8"
                            onClick={() => startEditing(tag)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="mt-4 text-sm text-muted-foreground text-center">
              {tagStats.length} total tags across {entries.filter(e => e.tags?.length).length} entries
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Dialog */}
      <AlertDialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <GitMerge className="w-5 h-5" />
              Merge Tags
            </AlertDialogTitle>
            <AlertDialogDescription>
              Merge {selectedTags.size} tags into a single tag. The selected tags will be replaced with the new tag in all entries.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="mb-4">
              <p className="text-sm font-medium mb-2">Tags to merge:</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedTags).map(tag => (
                  <Badge key={tag} variant="secondary">#{tag}</Badge>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Merge into tag:</label>
              <Input
                value={mergeTargetTag}
                onChange={(e) => setMergeTargetTag(e.target.value)}
                placeholder="Enter target tag name"
                className="mt-1"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleMerge}
              disabled={!mergeTargetTag.trim() || isProcessing}
            >
              {isProcessing ? 'Merging...' : 'Merge Tags'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Tags
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedTags.size} tag(s)? This will remove them from all journal entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <p className="text-sm font-medium mb-2">Tags to delete:</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(selectedTags).map(tag => (
                <Badge key={tag} variant="destructive">#{tag}</Badge>
              ))}
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDelete}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isProcessing ? 'Deleting...' : 'Delete Tags'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default TagManager;
