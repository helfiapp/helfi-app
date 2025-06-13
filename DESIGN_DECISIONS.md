# DESIGN DECISIONS LOG

## 🎨 HOMEPAGE LAYOUT (CRITICAL)

### Current Layout (WORKING - DO NOT CHANGE)
```css
/* Hero Section */
.hero-section {
  padding: py-20; /* Generous vertical padding */
}

/* Hero Text */
.hero-text {
  font-size: text-7xl; /* Large, impactful on desktop */
  responsive: text-4xl sm:text-5xl md:text-7xl;
}

/* Logo */
.logo {
  size: w-32 h-32; /* Desktop */
  mobile: w-24 h-24; /* Mobile */
}

/* Spacing */
.section-margins: mb-16;
.content-padding: p-8;
```

### Why These Decisions
- **User Feedback**: Previous layout looked "terrible" and "cramped"
- **Desktop Impact**: Large text (text-7xl) creates strong visual hierarchy
- **Breathing Room**: py-20 padding provides generous spacing
- **Professional Look**: Proper margins and padding create polished appearance

### Previous Problems (AVOID)
- ❌ `py-12` - Too cramped, insufficient spacing
- ❌ `text-5xl` - Too small for desktop impact
- ❌ Tight margins - Made layout feel compressed

## 🎯 SUPPORT PAGE DESIGN

### Implementation
- **URL**: `/support`
- **Email**: `support@helfi.ai`
- **Features**: Contact form, FAQ, mobile responsive
- **Layout**: Clean, professional, accessible

### Design Principles
- Clear call-to-action for support email
- Comprehensive FAQ section
- Mobile-first responsive design
- Consistent with main site branding

## 🎨 COLOR SCHEME

### Primary Colors
- **Helfi Green**: Primary brand color
- **Blue Accents**: Secondary color for variety
- **Gray Scale**: Text and neutral elements

### Usage Guidelines
- Green for primary actions and branding
- Blue for secondary elements and variety
- Maintain sufficient contrast for accessibility

## 📱 RESPONSIVE DESIGN

### Breakpoints
- **Mobile**: Default (text-4xl, w-24 h-24)
- **Small**: sm: (text-5xl)
- **Medium**: md: (text-7xl, w-32 h-32)

### Mobile Considerations
- Smaller logo and text sizes
- Maintained padding and spacing ratios
- Touch-friendly button sizes
- Readable font sizes

## 🔄 LAYOUT EVOLUTION

### Version History
1. **Original**: Cramped layout with insufficient spacing
2. **Improved**: Added generous padding and larger text
3. **Current**: Optimized desktop layout with proper hierarchy

### Lessons Learned
- Desktop layouts need generous spacing
- Text hierarchy is crucial for impact
- User feedback is essential for design validation
- Mobile responsiveness must be maintained

## 🚫 DESIGN DON'TS

### Never Change These Without Approval
- Hero section padding (py-20)
- Desktop text size (text-7xl)
- Logo dimensions (w-32 h-32 desktop)
- Section margins (mb-16)

### Common Mistakes to Avoid
- Reducing padding to save space
- Making text smaller for "cleaner" look
- Removing margins for "tighter" design
- Ignoring mobile responsiveness

---

**Last Updated**: January 25, 2025
**Status**: Current design working well ✅
**Next Review**: Only if user requests changes 