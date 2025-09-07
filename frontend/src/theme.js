// src/theme.js
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1170C3',   // น้ำเงินสด
    },
    secondary: {
      main: '#0D5FA7',   // น้ำเงินเข้ม
    },
    background: {
      default: '#f3f7fb',
    },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: 'Inter, Prompt, Roboto, Arial, sans-serif',
    h4: { fontWeight: 800 },
    h5: { fontWeight: 800 },
    button: { textTransform: 'none', fontWeight: 700 },
  },
});

export default theme;
