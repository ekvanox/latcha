'use client';

interface ImageGridProps {
  images: { data: string; mimeType: string }[];
  selected: Set<number>;
  onToggle: (index: number) => void;
  disabled?: boolean;
}

export function ImageGrid({ images, selected, onToggle, disabled }: ImageGridProps) {
  const cols = images.length <= 4 ? 2 : images.length <= 9 ? 3 : 4;

  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {images.map((img, i) => {
        const isSelected = selected.has(i);
        return (
          <button
            key={i}
            onClick={() => onToggle(i)}
            disabled={disabled}
            className={`
              relative rounded-lg overflow-hidden border-3 transition-all
              ${isSelected
                ? 'border-blue-500 ring-2 ring-blue-300'
                : 'border-gray-200 hover:border-gray-400 dark:border-gray-700'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <img
              src={`data:${img.mimeType};base64,${img.data}`}
              alt={`Option ${i + 1}`}
              className="w-full h-auto"
            />
            {isSelected && (
              <div className="absolute top-1 right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" strokeWidth={3} viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
