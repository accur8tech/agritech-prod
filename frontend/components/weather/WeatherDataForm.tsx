"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import apiClient from "@/lib/apiClient";
import { WeatherDownloadsService } from '@/lib/supabase';
import { CloudIcon } from "@heroicons/react/24/outline";
import cambodiaLocationData from "../../data/cambodia_locations.json";

const formSchema = z.object({
    country: z.string().min(1, "Country is required"),
    state: z.string().min(1, "State is required"),
    district: z.string().optional(),
    commune: z.string().optional(),
    startDate: z.date({
        required_error: "Start date is required",
    }),
    endDate: z.date({
        required_error: "End date is required",
    }),
    dataType: z.string().min(1, "Data type is required"),
});

const dataTypes = ["Temperature", "Precipitation"];

/** Format a Date as YYYY-MM-DD using the user's local calendar date (avoids timezone shift from toISOString). */
function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface LocationData {
    [province: string]: {
        [district: string]: string[];
    };
}

export default function WeatherDataForm() {
    const [provinces, setProvinces] = useState<string[]>([]);
    const [districts, setDistricts] = useState<string[]>([]);
    const [communes, setCommunes] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [downloadId, setDownloadId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            country: "Cambodia",
            state: "",
            district: "",
            commune: "",
            dataType: "",
        },
    });

    const selectedProvince = form.watch("state");
    const selectedDistrict = form.watch("district");

    useEffect(() => {
        const data = cambodiaLocationData as LocationData;
        const provinceList = Object.keys(data);
        setProvinces(provinceList);
    }, []);

    // Update districts when province changes
    useEffect(() => {
        if (!selectedProvince) {
            setDistricts([]);
            setCommunes([]);
            form.setValue("district", "");
            form.setValue("commune", "");
            return;
        }

        const data = cambodiaLocationData as LocationData;
        const provinceData = data[selectedProvince];
        if (provinceData) {
            const districtList = Object.keys(provinceData);
            setDistricts(districtList);
            // Reset commune when province changes
            setCommunes([]);
            form.setValue("district", "");
            form.setValue("commune", "");
        }
    }, [selectedProvince, form]);

    // Update communes when district changes
    useEffect(() => {
        if (!selectedProvince || !selectedDistrict || selectedDistrict === "__all__") {
            setCommunes([]);
            form.setValue("commune", "");
            return;
        }

        const data = cambodiaLocationData as LocationData;
        const provinceData = data[selectedProvince];
        if (provinceData && provinceData[selectedDistrict]) {
            const communeList = provinceData[selectedDistrict];
            setCommunes(communeList);
            form.setValue("commune", "");
        }
    }, [selectedProvince, selectedDistrict, form]);

    // Real-time subscription for download status updates
    useEffect(() => {
        if (!downloadId) return

        const subscription = WeatherDownloadsService.subscribeToDownloadUpdates(
            downloadId,
            (updatedDownload) => {
                if (updatedDownload.status === 'completed') {
                    setLoading(false)
                } else if (updatedDownload.status === 'failed') {
                    setError(updatedDownload.error_message || "Download failed")
                    setLoading(false)
                }
            }
        )

        return () => {
            subscription.unsubscribe()
        }
    }, [downloadId])


    // Update form submission (still uses backend for processing)
    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setLoading(true);
        setError(null);
        setDownloadId(null);
        
        const requestData: any = {
            dataset: values.dataType.toLowerCase(),
            provinces: [values.state],
            date_start: formatDateLocal(values.startDate),
            date_end: formatDateLocal(values.endDate)
        };

        // Add districts if a specific district is selected (not "All Districts")
        if (values.district && values.district !== "__all__") {
            requestData.districts = [values.district];
        }

        // Add communes if a specific commune is selected (not "All Communes")
        // Note: district must be included when commune is selected
        if (values.commune && values.commune !== "__all__") {
            requestData.communes = [values.commune];
        }
        
        try {
            const { data } = await apiClient.post('/api/climate-data', requestData);
            setDownloadId(data.download_id);
            // No need for polling - real-time subscription handles updates
        } catch (error) {
            console.error("Error submitting form:", error);
            setError("Failed to submit request. Please try again.");
            setLoading(false);
        }
    };

    return (
        <Card className="h-[800px] flex flex-col">
            <CardHeader className="flex-shrink-0">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <CloudIcon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                        <CardTitle>Request Weather Data</CardTitle>
                        <CardDescription>
                            Select your parameters to download weather data
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto">
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="country"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Country</FormLabel>
                                    <Select
                                        onValueChange={field.onChange}
                                        value={field.value}
                                        disabled
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a country" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="Cambodia">
                                                Cambodia
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Province</FormLabel>
                                    <Select
                                        onValueChange={(value) => field.onChange(value)}
                                        value={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select a province" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {provinces.map((province) => (
                                                <SelectItem key={province} value={province}>
                                                    {province}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="district"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>District</FormLabel>
                                    <Select
                                        onValueChange={(value) => field.onChange(value)}
                                        value={field.value}
                                        disabled={!selectedProvince}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={selectedProvince ? "Select a district" : "Select province first"} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {selectedProvince && (
                                                <>
                                                    <SelectItem value="__all__">
                                                        All Districts
                                                    </SelectItem>
                                                    {districts.map((district) => (
                                                        <SelectItem key={district} value={district}>
                                                            {district}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="commune"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Commune</FormLabel>
                                    <Select
                                        onValueChange={(value) => field.onChange(value)}
                                        value={field.value}
                                        disabled={!selectedDistrict || selectedDistrict === "__all__"}
                                    >
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder={selectedDistrict && selectedDistrict !== "__all__" ? "Select a commune" : selectedDistrict === "__all__" ? "Select specific district" : "Select district first"} />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {selectedDistrict && selectedDistrict !== "__all__" && (
                                                <>
                                                    <SelectItem value="__all__">
                                                        All Communes
                                                    </SelectItem>
                                                    {communes.map((commune) => (
                                                        <SelectItem key={commune} value={commune}>
                                                            {commune}
                                                        </SelectItem>
                                                    ))}
                                                </>
                                            )}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="startDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Start Date</FormLabel>
                                    <FormControl>
                                        <DateInput
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Pick a start date"
                                            id={field.name}
                                            aria-describedby={`${field.name}-error`}
                                            aria-invalid={!!form.formState.errors.startDate}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="endDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>End Date</FormLabel>
                                    <FormControl>
                                        <DateInput
                                            value={field.value}
                                            onChange={field.onChange}
                                            placeholder="Pick an end date"
                                            id={field.name}
                                            aria-describedby={`${field.name}-error`}
                                            aria-invalid={!!form.formState.errors.endDate}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="dataType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Data Type</FormLabel>
                                    <Select onValueChange={field.onChange}>
                                        <FormControl>
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select data type" />
                                            </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            {dataTypes.map((type) => (
                                                <SelectItem key={type} value={type}>
                                                    {type}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" disabled={loading}>
                            {loading ? "Processing..." : "Submit"}
                        </Button>

                        {error && <p className="text-red-500">{error}</p>}
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
