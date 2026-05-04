/**
 * Central SVG icon mapping for habit categories.
 * Uses lucide-react-native (backed by react-native-svg).
 * Maps each HabitCategory key to a lucide icon component.
 */
import React from 'react';
import {
  Dumbbell,        // physical
  GraduationCap,   // academics
  Heart,           // health
  Brain,           // mindfulness
  Palette,         // creativity
  Users,           // social
  Wallet,          // finance
  Rocket,          // productivity
  Salad,           // nutrition
  Moon,            // sleep
  Gamepad2,        // hobbies
  Sparkles,        // selfcare
  Languages,       // language
  ChefHat,         // cooking
  Music,           // music
  BookOpen,        // reading
  Plane,           // travel
  HeartHandshake,  // volunteering
  PawPrint,        // pets
  Droplets,        // cleaning
  Sprout,          // gardening
  Code,            // coding
  CheckCircle2,    // completion state
  LucideIcon,
} from 'lucide-react-native';
import type { HabitCategory } from '../types';

export const CATEGORY_ICONS: Record<HabitCategory, LucideIcon> = {
  physical: Dumbbell,
  academics: GraduationCap,
  health: Heart,
  mindfulness: Brain,
  creativity: Palette,
  social: Users,
  finance: Wallet,
  productivity: Rocket,
  nutrition: Salad,
  sleep: Moon,
  hobbies: Gamepad2,
  selfcare: Sparkles,
  language: Languages,
  cooking: ChefHat,
  music: Music,
  reading: BookOpen,
  travel: Plane,
  volunteering: HeartHandshake,
  pets: PawPrint,
  cleaning: Droplets,
  gardening: Sprout,
  coding: Code,
};

interface CategoryIconProps {
  category: HabitCategory;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function CategoryIcon({ category, size = 28, color = '#333', strokeWidth = 2 }: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon size={size} color={color} strokeWidth={strokeWidth} />;
}

export { CheckCircle2, LucideIcon };
