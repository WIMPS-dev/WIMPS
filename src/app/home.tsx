import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Image,
    LayoutAnimation,
    Linking,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { THEMES } from '../theme/themes';

// ─── Feature cards data ───────────────────────────────────────────────────────
const FEATURES = [
  {
    title: 'Full MIPS Instruction Set',
    body: 'Supports all of the R-type, I-type, and J-type instructions, as well as syscalls that MARS does. Simulate MIPS assembly right from your browser, with no install required.',
  },
  {
    title: 'Interactive Register View',
    body: 'Track the values of All 32 registers in real-time as your program runs. Includes both hex and decimal display modes.',
  },
  {
    title: 'Step-Through Simulation',
    body: 'Step instruction-by-instruction through your program, and inspect the registers and memory after every instruction.',
  },
  {
    title: 'Memory Inspector',
    body: 'Browse the simulated memory space. Inspect individual memory addresses around chunks of memory relevant to your program.',
  },
  {
    title: 'Syntax Coloring',
    body: 'Different syntax is highlighted as you type, just like your favorite IDE.',
  },
  {
    title: 'Runs Anywhere',
    body: 'Pure web: works on desktop, tablet, or mobile. Save your files directly to browser storage, or optionally, log in to prevent data loss.',
  },
];

// ─── Theme Switch ─────────────────────────────────────────────────────────────
interface ThemeSwitchProps {
  isDark: boolean;
  toggle: () => void;
}

const ThemeSwitch = ({ isDark, toggle }: ThemeSwitchProps) => {
  const slideAnim = useRef(new Animated.Value(isDark ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: isDark ? 1 : 0,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [isDark]);

  const thumbPosition = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 30] });
  const trackBg      = slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['#ffffff', '#2563eb'] });
  const trackBorder  = slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['#cbd5e1', '#2563eb'] });
  const thumbBg      = slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['#94a3b8', '#ffffff'] });
  const iconColor    = slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['#ffffff', '#2563eb'] });

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={toggle}>
      <Animated.View style={[switchStyles.track, { backgroundColor: trackBg, borderColor: trackBorder }]}>
        <Animated.View style={[switchStyles.thumb, { backgroundColor: thumbBg, transform: [{ translateX: thumbPosition }] }]}>
          <Animated.Text style={[switchStyles.icon, { color: iconColor }]}>
            {isDark ? '☾' : '☼'}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const switchStyles = StyleSheet.create({
  track: { width: 58, height: 32, borderRadius: 16, borderWidth: 2, justifyContent: 'center' },
  thumb: { width: 20, height: 20, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  icon:  { fontSize: 12, fontWeight: 'bold', lineHeight: 14 },
});

// ─── Top bar ──────────────────────────────────────────────────────────────────
interface TopBarProps {
  isDark: boolean;
  toggleTheme: () => void;
  theme: any;
  onLayout?: (height: number) => void;
}

function TopBar({ isDark, toggleTheme, theme, onLayout }: TopBarProps) {
  const router  = useRouter();
  const tStyles = useMemo(() => getThemeStyles(theme), [theme]);

  return (
    <View
      style={[staticStyles.topBar, { backgroundColor: theme.card, borderBottomColor: theme.border }]}
      onLayout={e => onLayout?.(e.nativeEvent.layout.height)}
    >
      <Image
        source={isDark ? require('../../assets/images/WIMPS_dark.png') : require('../../assets/images/WIMPS_light.png')}
        style={staticStyles.logo}
      />
      <View style={staticStyles.topBarActions}>
        <ThemeSwitch isDark={isDark} toggle={toggleTheme} />
        <TouchableOpacity style={tStyles.secondaryButton} onPress={() => router.push('/login' as any)} activeOpacity={0.75}>
          <Text style={tStyles.secondaryButtonText}>Log in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={staticStyles.signupBtn} onPress={() => router.push('/signup' as any)} activeOpacity={0.75}>
          <Text style={staticStyles.signupBtnText}>Sign up</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Bouncing arrow ───────────────────────────────────────────────────────────
interface ArrowProps {
  theme: any;
  onPress: () => void;
}

function BouncingArrow({ theme, onPress }: ArrowProps) {
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 10, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0,  duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={staticStyles.arrowBtn}>
      <Animated.View style={[staticStyles.arrowContainer, { transform: [{ translateY: bounceAnim }] }]}>
        {/* Chevron drawn with two lines */}
        <View style={[staticStyles.arrowLeft,  { borderColor: theme.subText }]} />
        <View style={[staticStyles.arrowRight, { borderColor: theme.subText }]} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Hero section (full-screen) ───────────────────────────────────────────────
interface HeroProps {
  theme: any;
  screenHeight: number;
  onArrowPress: () => void;
}

function HeroSection({ theme, screenHeight, onArrowPress }: HeroProps) {
  const router = useRouter();

  return (
    <View style={[staticStyles.hero, { height: screenHeight }]}>
      {/* Centred content */}
      <View style={staticStyles.heroContent}>
        <Text style={[staticStyles.heroTitle, { color: theme.text }]}>WIMPS</Text>
        <Text style={[staticStyles.heroSubtitle, { color: theme.text }]}>
          Web Interactive MIPS{'\n'}Pocket Simulator
        </Text>
        <Text style={[staticStyles.heroTagline, { color: theme.subText }]}>
          Write, run, and debug MIPS assembly directly from your browser:{'\n'}
          A "just works" MIPS Simulator.
        </Text>
        <View style={staticStyles.ctaRow}>
          <TouchableOpacity style={staticStyles.ctaPrimary} onPress={() => router.push('/')} activeOpacity={0.8}>
            <Text style={staticStyles.ctaPrimaryText}>Get Started →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[staticStyles.ctaSecondary, { borderColor: theme.border }]}
            onPress={() => Linking.openURL('https://github.com/DashellF/WIMPS')}
            activeOpacity={0.8}
          >
            <Text style={[staticStyles.ctaSecondaryText, { color: theme.text }]}>GitHub</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[staticStyles.ctaSecondary, { borderColor: theme.border }]}
            onPress={() => Linking.openURL('https://github.com/DashellF/WIMPS#readme')}
            activeOpacity={0.8}
          >
            <Text style={[staticStyles.ctaSecondaryText, { color: theme.text }]}>README</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Floating arrow pinned to bottom of hero */}
      <BouncingArrow theme={theme} onPress={onArrowPress} />
    </View>
  );
}

// ─── Feature grid ─────────────────────────────────────────────────────────────
const GAP   = 12;
const H_PAD = 24;

interface SectionProps { theme: any; }

function FeatureGrid({ theme }: SectionProps) {
  const { width } = useWindowDimensions();
  const cols = width >= 700 ? 3 : width >= 480 ? 2 : 1;
  const availableWidth = width - H_PAD * 2;
  const cardWidth = (availableWidth - GAP * (cols - 1)) / cols;

  return (
    <View style={staticStyles.section}>
      <Text style={[staticStyles.sectionTitle, { color: theme.text }]}>
        Everything you need to learn MIPS
      </Text>
      <View style={staticStyles.grid}>
        {FEATURES.map((f, i) => (
          <View key={i} style={[staticStyles.featureCard, { backgroundColor: theme.card, borderColor: theme.border, width: cardWidth }]}>
            <Text style={[staticStyles.featureTitle, { color: theme.text }]}>{f.title}</Text>
            <Text style={[staticStyles.featureBody,  { color: theme.subText }]}>{f.body}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Info section ─────────────────────────────────────────────────────────────
function InfoSection({ theme }: SectionProps) {
  return (
    <View style={staticStyles.infoSection}>
      <View style={[staticStyles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[staticStyles.infoHeading, { color: theme.text }]}>Built for students, by students</Text>
        <Text style={[staticStyles.infoBody, { color: theme.subText }]}>
          WIMPS started as a university project to make MIPS assembly more accessibly for CS students
          who shouldn't need to use a 20+ year old Java program just to learn computer architecture. It's
          free, open-source, and works directly in your browser, no setup required.
        </Text>
      </View>
      <View style={[staticStyles.infoCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[staticStyles.infoHeading, { color: theme.text }]}>Coming soon:</Text>
        {[
          'Interactive debugging with breakpoints',
          'Better, more detailed error outputs',
          'Complete UI overhaul',
          'Extra MARS-like tools: Bitmap Display, Data Cache Simulator...',
        ].map((item, i) => (
          <View key={i} style={staticStyles.roadmapItem}>
            <View style={[staticStyles.roadmapDot, { backgroundColor: theme.accent }]} />
            <Text style={[staticStyles.roadmapText, { color: theme.subText }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer({ theme }: SectionProps) {
  return (
    <View style={[staticStyles.footer, { borderTopColor: theme.border }]}>
      <Text style={[staticStyles.footerText, { color: theme.subText }]}>
        WIMPS · Open Source · MIT License
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [navbarHeight, setNavbarHeight] = useState(68);
  const { height: screenHeight } = useWindowDimensions();
  const heroHeight = screenHeight - navbarHeight;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const saved = await AsyncStorage.getItem('theme');
        if (saved !== null) setIsDarkMode(saved === 'dark');
      } catch (e) {
        console.error('Failed to load theme', e);
      }
    };
    loadTheme();
  }, []);

  const toggleTheme = async () => {
    const newMode = !isDarkMode;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsDarkMode(newMode);
    try {
      await AsyncStorage.setItem('theme', newMode ? 'dark' : 'light');
    } catch (e) {
      console.error('Save error', e);
    }
  };

  const scrollToContent = () => {
    // Scroll past the hero (its height == screenHeight)
    scrollRef.current?.scrollTo({ y: heroHeight, animated: true });
  };

  const activeTheme = isDarkMode ? THEMES.dark : THEMES.light;

  return (
    <SafeAreaView style={[staticStyles.safe, { backgroundColor: activeTheme.bg }]}>
      <StatusBar barStyle={activeTheme.statusBarStyle as any} />
      <TopBar isDark={isDarkMode} toggleTheme={toggleTheme} theme={activeTheme} onLayout={setNavbarHeight} />
      <ScrollView
        ref={scrollRef}
        style={staticStyles.scroll}
        contentContainerStyle={staticStyles.scrollContent}
        showsVerticalScrollIndicator={false}
        pagingEnabled={false}
        scrollEventThrottle={16}
      >
        <HeroSection theme={activeTheme} screenHeight={heroHeight} onArrowPress={scrollToContent} />
        <FeatureGrid theme={activeTheme} />
        <View style={[staticStyles.separator, { borderColor: activeTheme.border }]} />
        <InfoSection theme={activeTheme} />
        <Footer theme={activeTheme} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Theme-dependent styles ───────────────────────────────────────────────────
const getThemeStyles = (theme: any) =>
  StyleSheet.create({
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: theme.btnBg,
    },
    secondaryButtonText: { color: theme.text, fontWeight: '600' },
  });

// ─── Static styles ────────────────────────────────────────────────────────────
const staticStyles = StyleSheet.create({
  safe: { flex: 1 },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  logo:           { width: 240, height: 44, resizeMode: 'contain' },
  topBarActions:  { flexDirection: 'row', gap: 12, alignItems: 'center' },
  signupBtn:      { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  signupBtnText:  { color: '#ffffff', fontSize: 14, fontWeight: '700' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { paddingBottom: 60 },

  // Hero — fills remaining screen, centres content, pins arrow at bottom
  hero: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: H_PAD,
  },
  heroContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle:    { fontSize: 100, fontWeight: '900', letterSpacing: -2, textAlign: 'center' },
  heroSubtitle: { fontSize: 18, textAlign: 'center', fontFamily: 'monospace', letterSpacing: 0.5, marginTop: 6, marginBottom: 20 },
  heroTagline:  { fontSize: 15, textAlign: 'center', lineHeight: 24, maxWidth: 360, marginBottom: 36 },
  ctaRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  ctaPrimary:   { backgroundColor: '#2563eb', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 10 },
  ctaPrimaryText:   { color: '#ffffff', fontWeight: '800', fontSize: 15, letterSpacing: 0.3 },
  ctaSecondary:     { backgroundColor: 'transparent', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 10, borderWidth: 1 },
  ctaSecondaryText: { fontWeight: '600', fontSize: 14 },

  // Bouncing arrow
  arrowBtn: {
    paddingBottom: 36,
    alignItems: 'center',
  },
  arrowContainer: {
    width: 28,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Two lines meeting in a V — left arm and right arm of the chevron
  arrowLeft: {
    position: 'absolute',
    width: 16,
    height: 2,
    borderRadius: 1,
    borderBottomWidth: 2,
    left: 0,
    top: 7,
    transform: [{ rotate: '40deg' }],
  },
  arrowRight: {
    position: 'absolute',
    width: 16,
    height: 2,
    borderRadius: 1,
    borderBottomWidth: 2,
    right: 0,
    top: 7,
    transform: [{ rotate: '-40deg' }],
  },

  // Features
  section:      { paddingHorizontal: H_PAD, marginBottom: 56, paddingTop: 56 },
  sectionTitle: { fontSize: 26, fontWeight: '800', marginBottom: 24, letterSpacing: -0.5 },
  grid:         { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  featureCard:  { borderWidth: 1, borderRadius: 12, padding: 20 },
  featureTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  featureBody:  { fontSize: 13, lineHeight: 20 },

  // Separator
  separator: { borderTopWidth: 1, marginHorizontal: H_PAD, marginBottom: 56 },

  // Info
  infoSection:  { paddingHorizontal: H_PAD, gap: 16, marginBottom: 56 },
  infoCard:     { borderWidth: 1, borderRadius: 12, padding: 24 },
  infoHeading:  { fontSize: 20, fontWeight: '800', marginBottom: 12, letterSpacing: -0.3 },
  infoBody:     { fontSize: 14, lineHeight: 22 },
  roadmapItem:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  roadmapDot:   { width: 8, height: 8, borderRadius: 4 },
  roadmapText:  { fontSize: 14, lineHeight: 20 },

  // Footer
  footer:     { alignItems: 'center', paddingHorizontal: H_PAD, paddingTop: 32, borderTopWidth: 1 },
  footerText: { fontSize: 13, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 },
});