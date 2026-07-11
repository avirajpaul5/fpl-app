/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Wire all shadcn CSS variables into Tailwind v3 utilities
      colors: {
        background:       'var(--background)',
        foreground:       'var(--foreground)',
        card:             { DEFAULT: 'var(--card)',    foreground: 'var(--card-foreground)' },
        popover:          { DEFAULT: 'var(--popover)', foreground: 'var(--popover-foreground)' },
        primary:          { DEFAULT: 'var(--primary)', foreground: 'var(--primary-foreground)' },
        secondary:        { DEFAULT: 'var(--secondary)', foreground: 'var(--secondary-foreground)' },
        muted:            { DEFAULT: 'var(--muted)',   foreground: 'var(--muted-foreground)' },
        accent:           { DEFAULT: 'var(--accent)',  foreground: 'var(--accent-foreground)' },
        destructive:      { DEFAULT: 'var(--destructive)' },
        border:           'var(--border)',
        input:            'var(--input)',
        ring:             'var(--ring)',
        // Position — monochrome
        gk:  '#9ca3af',
        def: '#9ca3af',
        mid: '#9ca3af',
        fwd: '#9ca3af',
        // FDR scale — grayscale
        fdr1: '#f9fafb',
        fdr2: '#d1d5db',
        fdr3: '#6b7280',
        fdr4: '#374151',
        fdr5: '#030712',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
