import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Register fonts if needed, otherwise uses defaults
// Font.register({
//   family: 'Inter',
//   src: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2'
// });

const styles = StyleSheet.create({
    page: {
        padding: 50,
        backgroundColor: '#ffffff',
        fontFamily: 'Helvetica',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: '#0d9488', // teal-600
        paddingBottom: 20,
        marginBottom: 30,
    },
    logo: {
        width: 60,
        height: 60,
    },
    hospitalInfo: {
        textAlign: 'right',
    },
    hospitalName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0d9488',
        marginBottom: 4,
    },
    hospitalSub: {
        fontSize: 10,
        color: '#6b7280',
    },
    reportTitle: {
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 30,
        textTransform: 'uppercase',
        color: '#111827',
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#0d9488',
        backgroundColor: '#f0fdfa',
        padding: 6,
        marginBottom: 10,
        textTransform: 'uppercase',
    },
    infoGrid: {
        flexDirection: 'row',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 4,
    },
    infoCol: {
        flex: 1,
        padding: 10,
    },
    label: {
        fontSize: 9,
        color: '#6b7280',
        marginBottom: 2,
    },
    value: {
        fontSize: 11,
        color: '#111827',
        fontWeight: 'bold',
    },
    contentBody: {
        fontSize: 11,
        lineHeight: 1.6,
        color: '#374151',
    },
    listItem: {
        flexDirection: 'row',
        marginBottom: 4,
        paddingLeft: 10,
    },
    bullet: {
        width: 10,
        fontSize: 11,
    },
    footer: {
        position: 'absolute',
        bottom: 50,
        left: 50,
        right: 50,
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
        paddingTop: 20,
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    signatureContainer: {
        alignItems: 'center',
    },
    signatureLine: {
        width: 150,
        borderBottomWidth: 1,
        borderBottomColor: '#111827',
        marginBottom: 5,
    },
    signatureLabel: {
        fontSize: 10,
        color: '#111827',
    },
    confidential: {
        fontSize: 8,
        color: '#9ca3af',
        textAlign: 'center',
        marginTop: 40,
    }
});

interface ReportData {
    patientName: string;
    doctorName: string;
    date: string;
    duration: string;
    reportType: string;
    mood: string;
    progress: number;
    observations: string[];
    summary: string;
    recommendations: string;
    sessionId: string;
}

const HospitalReportTemplate: React.FC<{ data: ReportData }> = ({ data }) => (
    <Document>
        <Page size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Image src="/logo.png" style={styles.logo} />
                    <View style={{ marginLeft: 10 }}>
                        <Text style={styles.hospitalName}>VEERAWELL</Text>
                        <Text style={styles.hospitalSub}>Healthcare Management System</Text>
                    </View>
                </View>
                <View style={styles.hospitalInfo}>
                    <Text style={styles.hospitalSub}>123 Medical Avenue</Text>
                    <Text style={styles.hospitalSub}>support@veerawell.com</Text>
                    <Text style={styles.hospitalSub}>+1 (555) 000-0000</Text>
                </View>
            </View>

            {/* Title */}
            <Text style={styles.reportTitle}>{data.reportType} REPORT</Text>

            {/* Patient & Session Info */}
            <View style={styles.infoGrid}>
                <View style={[styles.infoCol, { borderRightWidth: 1, borderRightColor: '#e5e7eb' }]}>
                    <View style={{ marginBottom: 10 }}>
                        <Text style={styles.label}>PATIENT NAME</Text>
                        <Text style={styles.value}>{data.patientName}</Text>
                    </View>
                    <View>
                        <Text style={styles.label}>SESSION ID</Text>
                        <Text style={styles.value}>{data.sessionId.substring(0, 12).toUpperCase()}</Text>
                    </View>
                </View>
                <View style={styles.infoCol}>
                    <View style={{ marginBottom: 10, flexDirection: 'row' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>DATE</Text>
                            <Text style={styles.value}>{data.date}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>DURATION</Text>
                            <Text style={styles.value}>{data.duration} MIN</Text>
                        </View>
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>PATIENT MOOD</Text>
                            <Text style={styles.value}>{data.mood.toUpperCase()}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.label}>PROGRESS</Text>
                            <Text style={styles.value}>{data.progress}/5</Text>
                        </View>
                    </View>
                </View>
            </View>

            {/* Observations */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Key Clinical Observations</Text>
                <View style={styles.contentBody}>
                    {data.observations.map((obs, i) => (
                        <View key={i} style={styles.listItem}>
                            <Text style={styles.bullet}>•</Text>
                            <Text>{obs}</Text>
                        </View>
                    ))}
                    {data.observations.length === 0 && <Text style={{ fontStyle: 'italic', color: '#9ca3af' }}>No specific observations recorded.</Text>}
                </View>
            </View>

            {/* Summary */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Summary of Session</Text>
                <Text style={styles.contentBody}>{data.summary}</Text>
            </View>

            {/* Recommendations */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Clinical Recommendations & Next Steps</Text>
                <Text style={styles.contentBody}>{data.recommendations}</Text>
            </View>

            {/* Footer / Signatures */}
            <View style={styles.footer}>
                <View>
                    <Text style={styles.label}>GENERATED ON</Text>
                    <Text style={styles.value}>{new Date().toLocaleDateString()}</Text>
                </View>
                <View style={styles.signatureContainer}>
                    <View style={styles.signatureLine} />
                    <Text style={styles.signatureLabel}>Dr. {data.doctorName}</Text>
                    <Text style={styles.hospitalSub}>Practitioner Signature</Text>
                </View>
            </View>

            <Text style={styles.confidential}>
                CONFIDENTIAL: This document contains protected health information. Unauthorized disclosure is strictly prohibited.
            </Text>
        </Page>
    </Document>
);

export default HospitalReportTemplate;
