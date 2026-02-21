'use client';

interface MultipleChoiceProps {
  options: string[];
  selected: string | null;
  onSelect: (option: string) => void;
  disabled?: boolean;
}

export function MultipleChoice({ options, selected, onSelect, disabled }: MultipleChoiceProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((option, i) => {
        const letter = String.fromCharCode(65 + i);
        const isSelected = selected === option;
        return (
          <button
            key={option}
            onClick={() => onSelect(option)}
            disabled={disabled}
            className={`
              px-4 py-3 rounded-lg border-2 text-left font-medium transition-all
              ${isSelected
                ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'border-gray-200 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-500'}
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
          >
            <span className="text-sm text-gray-400 mr-2">{letter})</span>
            {option}
          </button>
        );
      })}
    </div>
  );
}
