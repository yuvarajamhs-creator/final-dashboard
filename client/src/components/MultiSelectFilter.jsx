import React, { useState, useRef, useEffect } from 'react';
import './MultiSelectFilter.css';

const MultiSelectFilter = ({
  label,
  emoji,
  options = [],
  selectedValues = [],
  onChange,
  placeholder = "All",
  getOptionLabel = (opt) => opt.name || opt.label || opt,
  getOptionValue = (opt) => opt.id || opt.value || opt,
  disabled = false,
  loading = false,
  maxHeight = '300px'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter options based on search term
  const filteredOptions = options.filter(option => {
    const label = getOptionLabel(option);
    return label.toLowerCase().includes(searchTerm.toLowerCase());
  });

  // Handle checkbox toggle
  const handleToggle = (value) => {
    const newSelected = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    onChange(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedValues.length === filteredOptions.length) {
      onChange([]);
    } else {
      const allValues = filteredOptions.map(opt => getOptionValue(opt));
      onChange(allValues);
    }
  };

  // Get display text
  const getDisplayText = () => {
    if (selectedValues.length === 0) {
      return placeholder;
    }
    // Check if all options are selected
    if (filteredOptions.length > 0 && filteredOptions.every(opt => selectedValues.includes(getOptionValue(opt)))) {
      return placeholder; // Show "All Campaigns" or "All Ads" when all selected
    }
    if (selectedValues.length === 1) {
      const selectedOption = options.find(opt => getOptionValue(opt) === selectedValues[0]);
      return selectedOption ? getOptionLabel(selectedOption) : `${selectedValues.length} item`;
    }
    return `${selectedValues.length} items`;
  };

  const allSelected = filteredOptions.length > 0 && 
    filteredOptions.every(opt => selectedValues.includes(getOptionValue(opt)));

  return (
    <div className="multi-select-filter-wrapper" ref={dropdownRef}>
      <label className="filter-label">
        <span className="filter-emoji">{emoji}</span> {label}
      </label>
      <div className="multi-select-dropdown">
        <button
          type="button"
          className={`multi-select-button ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
        >
          <span className="multi-select-button-text">{getDisplayText()}</span>
          <i className={`fas fa-chevron-down multi-select-arrow ${isOpen ? 'rotated' : ''}`}></i>
        </button>

        {isOpen && (
          <div className="multi-select-dropdown-menu">
            {/* Search Input */}
            <div className="multi-select-search">
              <i className="fas fa-search multi-select-search-icon"></i>
              <input
                type="text"
                className="multi-select-search-input"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            {/* Select All Option */}
            {filteredOptions.length > 0 && (
              <div className="multi-select-item multi-select-item-all">
                <label className="multi-select-checkbox-label">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={handleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="multi-select-checkbox-text">Select All</span>
                </label>
              </div>
            )}

            {/* Options List */}
            <div className="multi-select-options" style={{ maxHeight }}>
              {loading && options.length === 0 ? (
                <div className="multi-select-no-results">Loading...</div>
              ) : filteredOptions.length === 0 ? (
                <div className="multi-select-no-results">No results found</div>
              ) : (
                filteredOptions.map((option) => {
                  const value = getOptionValue(option);
                  const label = getOptionLabel(option);
                  const isSelected = selectedValues.includes(value);

                  return (
                    <div
                      key={value}
                      className={`multi-select-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleToggle(value)}
                    >
                      <label className="multi-select-checkbox-label">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggle(value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span className="multi-select-checkbox-text">{label}</span>
                      </label>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MultiSelectFilter;
