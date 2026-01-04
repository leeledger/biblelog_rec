import React from 'react';
import { MaintenanceInfo } from '../types';

interface MaintenanceBannerProps {
  maintenanceInfo: MaintenanceInfo;
  onDismiss?: () => void;
  isAdmin?: boolean;
}

const MaintenanceBanner: React.FC<MaintenanceBannerProps> = ({ 
  maintenanceInfo, 
  onDismiss, 
  isAdmin = false 
}) => {
  if (!maintenanceInfo.isUnderMaintenance) {
    return null;
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full text-center">
        <h2 className="text-red-600 text-xl font-bold mb-4">서비스 점검 안내</h2>
        <p className="text-gray-700 mb-4">{maintenanceInfo.message}</p>
        
        {maintenanceInfo.expectedEndTime && (
          <p className="text-gray-500 text-sm mb-4">
            예상 완료 시간: {new Date(maintenanceInfo.expectedEndTime).toLocaleString()}
          </p>
        )}
        
        {isAdmin && onDismiss && (
          <button 
            onClick={onDismiss}
            className="mt-4 bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded transition-colors"
          >
            유지보수 모드 해제 (관리자 전용)
          </button>
        )}
      </div>
    </div>
  );
};

export default MaintenanceBanner;
