import { motion, type HTMLMotionProps } from 'motion/react';

interface RevealProps extends HTMLMotionProps<'div'> {
  /** Seconds to wait before revealing — use small steps to stagger siblings. */
  delay?: number;
}

/** Subtle fade-and-rise as content scrolls into view (once). */
export function Reveal({ delay = 0, ...props }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.35, ease: 'easeOut', delay }}
      {...props}
    />
  );
}
