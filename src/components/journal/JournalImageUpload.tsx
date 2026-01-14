import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ImagePlus, X, Loader2, ZoomIn } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

interface JournalImageUploadProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  disabled?: boolean;
  maxImages?: number;
}

const JournalImageUpload = ({ 
  images, 
  onImagesChange, 
  disabled = false,
  maxImages = 5 
}: JournalImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (images.length + files.length > maxImages) {
      toast({
        title: "Too many images",
        description: `You can only attach up to ${maxImages} images per entry`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const newImageUrls: string[] = [];

      for (const file of Array.from(files)) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast({
            title: "Invalid file type",
            description: `${file.name} is not an image`,
            variant: "destructive",
          });
          continue;
        }

        // Validate file size (5MB max)
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: "File too large",
            description: `${file.name} exceeds 5MB limit`,
            variant: "destructive",
          });
          continue;
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(7);
        const extension = file.name.split('.').pop();
        const filePath = `${user.id}/${timestamp}-${randomString}.${extension}`;

        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('journal-images')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          toast({
            title: "Upload failed",
            description: `Failed to upload ${file.name}`,
            variant: "destructive",
          });
          continue;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('journal-images')
          .getPublicUrl(filePath);

        newImageUrls.push(publicUrl);
      }

      if (newImageUrls.length > 0) {
        onImagesChange([...images, ...newImageUrls]);
        toast({
          title: "Images uploaded",
          description: `${newImageUrls.length} image(s) attached successfully`,
        });
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = async (urlToRemove: string) => {
    try {
      // Extract file path from URL
      const url = new URL(urlToRemove);
      const pathParts = url.pathname.split('/journal-images/');
      if (pathParts.length > 1) {
        const filePath = decodeURIComponent(pathParts[1]);
        
        // Delete from storage
        const { error } = await supabase.storage
          .from('journal-images')
          .remove([filePath]);

        if (error) {
          console.error('Delete error:', error);
        }
      }

      // Update state regardless of storage delete result
      onImagesChange(images.filter(url => url !== urlToRemove));
    } catch (error) {
      console.error('Remove error:', error);
      // Still remove from state
      onImagesChange(images.filter(url => url !== urlToRemove));
    }
  };

  return (
    <div className="space-y-3">
      {/* Upload button */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          disabled={disabled || uploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading || images.length >= maxImages}
          className="gap-2"
        >
          {uploading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ImagePlus className="w-4 h-4" />
          )}
          {uploading ? 'Uploading...' : 'Add Screenshots'}
        </Button>
        <span className="text-xs text-muted-foreground">
          {images.length}/{maxImages} images
        </span>
      </div>

      {/* Image preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {images.map((url, index) => (
            <div 
              key={url} 
              className="relative group aspect-video rounded-lg overflow-hidden border border-border bg-muted"
            >
              <img
                src={url}
                alt={`Chart screenshot ${index + 1}`}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              
              {/* Overlay with actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="icon" variant="secondary" className="h-8 w-8">
                      <ZoomIn className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl p-0 overflow-hidden">
                    <img
                      src={url}
                      alt={`Chart screenshot ${index + 1}`}
                      className="w-full h-auto"
                    />
                  </DialogContent>
                </Dialog>
                
                {!disabled && (
                  <Button 
                    size="icon" 
                    variant="destructive" 
                    className="h-8 w-8"
                    onClick={() => handleRemoveImage(url)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JournalImageUpload;
