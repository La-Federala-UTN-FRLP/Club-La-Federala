// src/components/Cards/Lotes/LoteImageUploader.jsx
// Componente reutilizable para subida de imágenes de lotes
// Reutilizamos el mismo componente de subida de imágenes en Crear y Editar lote
// para garantizar un comportamiento consistente.

import { useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2, Upload, GripVertical } from "lucide-react";
import { useToast } from "../../../app/providers/ToastProvider.jsx";

// Componente para cada miniatura ordenable
function SortableImageItem({ image, index, onRemove, getImageUrl, canRemove = true }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `image-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const imageUrl = getImageUrl(image);
  
  if (!imageUrl) {
    return null;
  }

  return (
    <div ref={setNodeRef} style={style} className="lote-image-thumbnail">
      <div className="lote-image-thumbnail__image-wrapper">
        <img src={imageUrl} alt={`Imagen ${index + 1}`} onError={(e) => { e.target.style.display = 'none'; }} />
        <div className="lote-image-thumbnail__overlay">
          <button
            type="button"
            className="lote-image-thumbnail__drag"
            {...attributes}
            {...listeners}
            aria-label="Reordenar"
          >
            <GripVertical size={18} strokeWidth={2} />
          </button>
          {canRemove && (
            <button
              type="button"
              className="lote-image-thumbnail__delete"
              onClick={() => onRemove(index)}
              aria-label="Eliminar imagen"
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoteImageUploader({ 
  images = [], 
  onChange,
  onDeletedIdsChange, // Callback para notificar IDs de imágenes eliminadas (solo para editar)
  inputId = "file-input-lote",
  // false: oculta el borrado de imágenes ya guardadas (DELETE /api/files/:id es solo Admin/Gestor).
  // Las imágenes nuevas sin subir se pueden quitar igual: no llaman al backend.
  canDelete = true,
}) {
  const { error: showError } = useToast();
  const fileInputRef = useRef(null);
  const [deletedIds, setDeletedIds] = useState([]);

  // Limpiar URLs de objeto al desmontar o cambiar imágenes
  useEffect(() => {
    const currentImages = images || [];
    return () => {
      currentImages.forEach((img) => {
        if (img instanceof File && img.objectURL) {
          URL.revokeObjectURL(img.objectURL);
        }
      });
    };
  }, [images]);

  // Notificar cambios en IDs eliminados
  useEffect(() => {
    if (onDeletedIdsChange) {
      onDeletedIdsChange(deletedIds);
    }
  }, [deletedIds, onDeletedIdsChange]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (imageFiles.length !== files.length) {
      showError("Solo se pueden subir archivos de imagen");
      return;
    }

    const filesWithPreview = imageFiles.map((file) => {
      const fw = file;
      fw.objectURL = URL.createObjectURL(file);
      return fw;
    });

    const currentImages = (images || []).filter(img => img != null);
    onChange([...currentImages, ...filesWithPreview]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemoveImage = (index) => {
    const img = images[index];
    if (img instanceof File && img.objectURL) {
      try {
        URL.revokeObjectURL(img.objectURL);
      } catch (e) {
        console.error("Error liberando objectURL:", e);
      }
    }
    if (img && img.id) {
      setDeletedIds(prev => [...prev, img.id]);
    }
    const next = images.filter((_, i) => i !== index);
    onChange(next);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parseInt(active.id.toString().replace("image-", ""));
    const newIndex = parseInt(over.id.toString().replace("image-", ""));
    const newImages = arrayMove(images, oldIndex, newIndex);
    onChange(newImages);
  };

  const getImageUrl = (img) => {
    if (!img) return null;
    if (img instanceof File && img.objectURL) return img.objectURL;
    if (img?.url?.startsWith('http')) return img.url;
    return null;
  };

  const validImages = (images || []).filter(img => {
    if (!img) return false;
    if (img instanceof File) return img.objectURL != null;
    return img?.id && img?.url?.startsWith('http');
  });

  return (
    <div className="lote-image-manager-card">
      <h3 className="lote-image-manager-card__title">Imágenes del lote</h3>
      
      <div className="lote-image-grid-container">
        {validImages.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={validImages.map((img, idx) => {
                return img instanceof File 
                  ? `file-${idx}-${img.name}-${img.size}`
                  : `img-${img.id}`;
              })}
              strategy={rectSortingStrategy}
            >
              <div className="lote-image-grid">
                {validImages.map((img, idx) => {
                  const imageUrl = getImageUrl(img);
                  if (!imageUrl) return null;
                  const uniqueKey = img instanceof File 
                    ? `file-${idx}-${img.name}-${img.size}` 
                    : `img-${img.id}`;
                  return (
                    <SortableImageItem
                      key={uniqueKey}
                      image={img}
                      index={images.indexOf(img)}
                      onRemove={handleRemoveImage}
                      getImageUrl={getImageUrl}
                      canRemove={canDelete || img instanceof File}
                    />
                  );
                }).filter(Boolean)}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="lote-image-empty">
            <p>Imagen no cargada</p>
          </div>
        )}
      </div>

      <div className="lote-image-dropzone">
        <div
          className="lote-image-dropzone__area"
          onDragOver={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add("is-dragover");
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove("is-dragover");
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.currentTarget.classList.remove("is-dragover");
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length > 0) {
              const imageFiles = files.filter((file) => file.type.startsWith("image/"));
              if (imageFiles.length !== files.length) {
                showError("Solo se pueden subir archivos de imagen");
                return;
              }
              const filesWithPreview = imageFiles.map((file) => {
                const fw = file;
                fw.objectURL = URL.createObjectURL(file);
                return fw;
              });
              const currentImages = (images || []).filter(img => img != null);
              onChange([...currentImages, ...filesWithPreview]);
            }
          }}
        >
          <Upload size={32} strokeWidth={1.5} />
          <p>Arrastrá aquí tus imágenes</p>
          <span>o</span>
          <label htmlFor={inputId} className="lote-image-dropzone__button">
            Seleccionar imágenes
          </label>
          <input
            ref={fileInputRef}
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            style={{ display: "none" }}
          />
        </div>
      </div>
    </div>
  );
}

